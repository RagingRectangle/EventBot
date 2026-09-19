const {
  Client,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
  InteractionType
} = require('discord.js');
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildScheduledEvents, GatewayIntentBits.DirectMessages],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});
const _ = require('lodash');
const cheerio = require('cheerio');
const fs = require('fs');
const fetch = require('node-fetch');
const moment = require('moment');
const schedule = require('node-schedule');
const SlashRegistry = require("./slashRegistry.js");
var config = require('./config.json');
var util = require('./util.json');
var emojiList = {};
var trashServer = '';
var newEventTypes = [];

//Config check
let oldConfigs = ['months', 'eventTypesAll', 'eventTypesRaid', 'eventTypesSpotCase', 'timezoneOffset'];
for (const [key, value] of Object.entries(config)) {
  if (oldConfigs.includes(key)){
    console.log(`config.json no longer requires the '${key}' section.`);
  }
}
if (!config.ignoreTypes){
  console.log(`New config option available: 'ignoreTypes'. Array of event types to ignore. Full list at util.eventTypesAll`);
}

//Old file check
if (fs.existsSync('./autoUpdates.json')){
  console.log('autoUpdates.json is no longer used and can be deleted.')
}

//Event json check
if (!fs.existsSync('./events.json')) {
  fs.writeFileSync('./events.json', '{}');
}

//Shiny list check
if (!fs.existsSync('./shinyList.json')) {
  fs.writeFileSync('./shinyList.json', '{}');
}
var shinyList = require('./shinyList.json');

//Auto update check
if (config.autoUpdate == true && !fs.existsSync('./eventMessages.json')) {
  fs.writeFileSync('./eventMessages.json', '{}');
}

//Emoji check
if (!fs.existsSync('./emojis.json')) {
  fs.writeFileSync('./emojis.json', '{}');
}
emojiList = JSON.parse(fs.readFileSync('./emojis.json'));


client.on('ready', async () => {
  console.log("EventBot logged in");

  //Fetch trash server
  if (config.useEmojis == true && config.trashServerID) {
    try {
      trashServer = await client.guilds.fetch(config.trashServerID);
      var trashServerEmojis = {};
      trashServer.emojis.cache.forEach(async (emoji) => {
        //Check for duplicates
        if (trashServerEmojis[emoji.name]) {
          await emoji.delete()
            .then(emoji => console.log(`Deleted duplicate emoji ${emoji.name}`))
            .catch(console.error);
        } else {
          trashServerEmojis[emoji.name] = emoji.id;
        }
      });
      var newEmojiList = {};
      for (const [monName, monIndex] of Object.entries(util)) {
        try {
          if (Object.keys(trashServerEmojis).includes(monIndex)) {
            newEmojiList[monName] = trashServerEmojis[monIndex];
          }
          if (Object.keys(trashServerEmojis).includes(`${monIndex}_s`)) {
            newEmojiList[`${monName} Shiny`] = trashServerEmojis[`${monIndex}_s`];
          }
        } catch (err) {
          console.log(err);
        }
      }
      emojiList = newEmojiList
      fs.writeFileSync('./emojis.json', JSON.stringify(emojiList));
    } catch (err) {
      console.log(`Failed to fetch emoji trash server: ${err}`);
      process.exit();
    }
  } else {
    console.log('Emojis skipped');
  }

  fetchShinyList(client);
  //Fetch new events cron
  try {
    const fetchEventsJob = schedule.scheduleJob('fetchEventsJob', '55 * * * *', function () {
      fetchShinyList(client);
    });
  } catch (err) {
    console.log(err);
  }

  //Auto update cron
  try {
    if (config.autoUpdate == true) {
      const updateEventsJob = schedule.scheduleJob('updateEventsJob', '0 * * * *', function () {
        cronUpdates();
      });
    }
  } catch (err) {
    console.log(err);
  }

  //Register Slash Commands
  SlashRegistry.registerCommands(client, config);
}); //End of ready()

async function fetchShinyList(client) {
  try {
    fetch('https://raw.githubusercontent.com/jms412/PkmnShinyMap/main/shinyPossible.json', {
        method: "Get"
      })
      .then(res => res.json())
      .then((json) => {
        shinyList = json.map;
        fetchLeekEvents(client);
        fs.writeFileSync('./shinyList.json', JSON.stringify(json.map));
      });
  } catch (err) {
    console.log(`Failed to fetch new shiny list: ${err}`);
    fetchLeekEvents(client);
  }
} //End of fetchShinyList()

async function fetchLeekEvents(client) {
  try {
    const response = await fetch('https://leekduck.com/events/');
    const body = await response.text();
    const $ = cheerio.load(body);
    var eventLinks = [];
    newEventTypes = [];
    $('.event-item-link').each((i, classEvent) => {
      let classAttr = $(classEvent).attr('class') || '';
      if (classAttr.includes('-ended')) {
        return;
      }
      let type = $(classEvent).find('p').first().text().replace('Ticketed', 'Ticketed Event');
      let link = $(classEvent).attr('href');
      if (util.eventTypesAll.includes(type)) {
        eventLinks.push({
          type: type,
          link: link
        });
      }
      else if (type && !newEventTypes.includes(type)) {
        newEventTypes.push(type);
      }
    });
    eventLinks = _.uniqBy(eventLinks, 'link');
    scrapeLinks(client, eventLinks);
  } catch (err) {
    console.log(err);
  }
} //End of fetchLeekEvents()

function buildSection(header, events, opts) {
  const maxLen = opts.maxLen || 4000;
  const showStart = opts.showStart !== false;
  const showEnd = opts.showEnd !== false;
  const links = opts.links !== false;

  //Reset per-run flags
  for (const e of events) {
    e._startR = true;
    e._endR = true;
    e._link = true;
  }

  const renderEntry = (e) => {
    const title = (links && e._link && !(e.tbaStart && e.tbaEnd)) ? `[${e.name}](${e.link})` : e.name;
    const lines = [title];

    const isRaidHour = e.type === 'Raid Hour';
    if (e.tbaStart && e.tbaEnd) {
      //Fully TBA — collapse to a single line
      lines.push('- Starts: TBA');
    } else {
      if (!e.tbaStart && showStart) {
        let s = `- Starts ${e.startText}`;
        if (e._startR) s += ` <t:${e.startTimeUnix}:R>`;
        lines.push(s);
      }
      if (showEnd && !(isRaidHour && showStart)) {
        let en = `- Ends ${e.endText}`;
        if (e._endR) en += ` <t:${e.endTimeUnix}:R>`;
        lines.push(en);
      }
    }
    return lines.join('\n') + (e.extraInfo || '');
  };

  const build = () => {
    const out = [header];
    for (const e of events) out.push(renderEntry(e));
    return out;
  };

  let result = build();
  if (result.join('\n\n').length <= maxLen) return result;

  //Phase 1: strip End R, bottom-up (furthest future first)
  if (showEnd) {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].tbaStart && events[i].tbaEnd) continue;
      if (events[i].type === 'Raid Hour') continue;
      events[i]._endR = false;
      result = build();
      if (result.join('\n\n').length <= maxLen) return result;
    }
  }

  //Phase 2: strip Start R, bottom-up
  if (showStart) {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].tbaStart && events[i].tbaEnd) continue;
      events[i]._startR = false;
      result = build();
      if (result.join('\n\n').length <= maxLen) return result;
    }
  }

  //Phase 3: remove hyperlinks, bottom-up
  if (links) {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].tbaStart && events[i].tbaEnd) continue; // already rendered without a link
      events[i]._link = false;
      result = build();
      if (result.join('\n\n').length <= maxLen) return result;
    }
  }

  //Fallback: truncate from the bottom if still over
  while (events.length > 1 && result.join('\n\n').length > maxLen) {
    events.pop();
    result = build();
  }

  return result;
}

async function scrapeLinks(client, eventLinks) {
  var newEmojiList = {};
  var currentEventsTemp = [];
  var futureEventsCDTemp = [];
  var futureEventsRaidTemp = [];
  var futureEventsSpotCaseTemp = [];
  var futureEventsMaxBattleTemp = [];
  var futureEventsOtherTemp = [];
  for (var e in eventLinks) {
    try {
      let eventResponse = await fetch(`https://leekduck.com${eventLinks[e]['link']}`);
      const body = await eventResponse.text();
      const $ = cheerio.load(body);
      var name = $('.page-title').text().trim();

      //Parse embedded schedule JSON (replaces old #event-date-start/#event-time-start etc.)
      var scheduleJSON = {};
      try {
        scheduleJSON = JSON.parse($('script[data-event-schedule-json]').first().text());
      } catch (err) {
        //No schedule block (non-local/Tour events) -> skip like the old check did
        continue;
      }
      //Skip non-local events (Tours) - no _local wall-clock times
      if (!scheduleJSON.envelope || !scheduleJSON.envelope.start_local || !scheduleJSON.envelope.end_local) {
        continue;
      }
      var isTBAStart = scheduleJSON.mode === 'tba';

      var isTBAEnd = isTBAStart && (
        scheduleJSON.open_ended === true ||
        moment.utc(scheduleJSON.envelope.end_local)
          .diff(moment.utc(scheduleJSON.envelope.start_local), 'hours') <= 1
      );

      //Absolute instants for <t:...:R>
      var startMoment, endMoment;
      if (scheduleJSON.local_time === true) {
        //Local-time event: anchor the bare wall-clock to the MACHINE's zone,
        //so the instant lands on that wall-clock time for the bot's audience.
        startMoment = moment(scheduleJSON.envelope.start_local);
        endMoment   = moment(scheduleJSON.envelope.end_local);
      } else {
        //Global event: start/end carry a real UTC offset -> use it directly.
        startMoment = moment.parseZone(scheduleJSON.envelope.start);
        endMoment   = moment.parseZone(scheduleJSON.envelope.end);
      }
      var startTimeUnix = startMoment.format('X');
      var endTimeUnix = endMoment.format('X');
      var hoursUntilStart = (startTimeUnix - moment(new Date()).format('X')) / 60 / 60;
      var hoursUntilEnd = (endTimeUnix - moment(new Date()).format('X')) / 60 / 60;

      //Bare wall-clock strings from start_local/end_local (used for static display text).
      //Parsed with moment.utc() so the numbers are formatted as-is with NO zone shift.
      var startLocalMoment = moment.utc(scheduleJSON.envelope.start_local);
      var endLocalMoment   = moment.utc(scheduleJSON.envelope.end_local);

      var startTimeText = config['24Hour'] == true ? startLocalMoment.format('HH:mm') : startLocalMoment.format('h A');
      var endTimeText   = config['24Hour'] == true ? endLocalMoment.format('HH:mm') : endLocalMoment.format('h A');
      var startText = `${startLocalMoment.format('ddd, MMM D')} @ ${startTimeText}`;
      var endText   = `${endLocalMoment.format('ddd, MMM D')} @ ${endTimeText}`;

      let eventName = name.replaceAll(' ', ' ').replace('PokéStop Showcases', 'Showcases').replace('5-star Raid Battles', '5* Raids').replace('in Shadow Raids', 'Raids').replace('in Mega Raids', 'Raids').replace('Community Day', 'CD');

      //Extra info
      var extraInfo = [];
      //Graphics
      if (config.graphics == true) {
        var graphicLinks = [];
        $('p').each((i, paragraph) => {
          var graphicLink = $(paragraph).find('img').attr('src');
          if (graphicLink && !graphicLink.includes('article-images')) {
            graphicLink = graphicLink.replaceAll(' ', ' ').replaceAll(' ', '%20');
            //Research graphic
            if (graphicLink.includes('Special%20Research')) {
              graphicLinks.push(`[Research](${graphicLink})`);
            }
            //Raid guide graphic
            else if (util.eventTypesRaid.includes(eventLinks[e]['type'])){
              graphicLinks.push(`[Guide](${graphicLink})`);
            }
            //Parts
            else if (graphicLink.replace('%20Page%20', '%20Part%20').includes('%20Part%20')) {
              for (var i = 1; i < 5; i++){
                if (graphicLink.replace('%20Page%20', '%20Part%20').includes(`%20Part%20${i}.`)){
                  graphicLinks.push(`[Part ${i}](${graphicLink})`);
                }
              }
            }
            //Overview graphic
            else {
              graphicLinks.push(`[Overview](${graphicLink})`);
            }
          }
        }); //End of graphic scrape
        if (graphicLinks.length > 0) {
          extraInfo.push(`\n- Graphics: ${graphicLinks.join(' | ')}`);
        }
      } //End of graphics

      //Quest Reroll
      if (config.questReroll == true) {
        $('h2').each((i, header) => {
          if ($(header).text() == 'Field Research Tasks') {
            extraInfo.push(`\n- ${config.rerollText}`);
          }
        });
      } //End of questReroll

      //Bonus
      if (config.bonus == true && eventLinks[e]['type'] == 'Pokémon Spotlight Hour') {
        $('p').each((i, paragraph) => {
          if ($(paragraph).text().includes('the special bonus is ')) {
            let bonusSplit = $(paragraph).text().split('the special bonus is ');
            extraInfo.push(`\n- Bonus: ${bonusSplit[1].replace('.', '')}`);
          }
        });
      } //End of questReroll

      //Max Battle Pokemon
      if (eventName.startsWith('Max Battles -')){
        var maxPokemon = [];
        $('.pkmn-name').each((index, element) => {
          maxPokemon.push($(element).text());
        });
        extraInfo.push(`\n- ${maxPokemon.join(', ')}`);
      }

      //Emojis
      if (trashServer) {
        //Community Day + mega raids + raid hour + 5* raids + raid day + showcases(single) + spotlights + elite raids
        if (eventLinks[e]['type'] == 'Community Day' || eventName.startsWith('Mega ') || eventName.endsWith(' Raid Hour') || eventName.endsWith(' in 5* Raids') || eventName.startsWith('Raid Day: ') || eventName.endsWith(' Raid Day') || eventName.endsWith(' Showcases') || eventName.endsWith(' Spotlight Hour') || eventName.endsWith(' in Elite Raids') || eventName.endsWith(' Raids')) {
          var normalEmojiID = '';
          var normalEmoji = '';
          var shinyEmojiID = '';
          var shinyEmoji = '';
          var monName = eventName.replace(' CD Classic', '').replace(' CD', '').replace(' Super Mega', '').replace(' Raids', '').replace(' Raid Hour', '').replace(' in 5*', '').replace('Raid Day: ', '').replace(' Raid Day', '').replace(' Showcases', '').replace(' Spotlight Hour', '').replace(' Shadow ', '').replace('Shadow ','');          if (util[monName]) {
            //Check shiny status
            var shinyStatus = false;
            if (eventLinks[e]['type'] == 'Community Day' || eventName.startsWith('Mega ')) {
              shinyStatus = true;
            } else {
              if (shinyList[util[monName]] == ' ✨' || shinyList[`${util[monName]}_0`]) {
                shinyStatus = true;
              }
            }
            //Emoji check
            if (newEmojiList[monName]) {
              //Do nothing
            } else if (emojiList[monName] && !newEmojiList[monName]) {
              newEmojiList[monName] = emojiList[monName];
              newEmojiList[`${monName} Shiny`] = emojiList[`${monName} Shiny`];
            }
            //Create emoji
            else {
              console.log(`Create ${monName} emojis...`);
              //Normal
              normalEmojiID = await createEmoji(util[monName]);
              if (normalEmojiID != 'ERROR') {
                newEmojiList[monName] = normalEmojiID;
                await new Promise(done => setTimeout(done, 3000));
              }
              //Shiny
              shinyEmojiID = await createEmoji(`${util[monName]}_s`);
              if (shinyEmojiID != 'ERROR') {
                newEmojiList[`${monName} Shiny`] = shinyEmojiID;
                await new Promise(done => setTimeout(done, 3000));
              }
            }
          }
          normalEmojiID = newEmojiList[monName];
          shinyEmojiID = newEmojiList[`${monName} Shiny`];
          if (normalEmojiID) {
            normalEmoji = await trashServer.emojis.cache.find(emoji => emoji.id == normalEmojiID);
          }
          if (shinyEmojiID && shinyStatus == true) {
            shinyEmoji = await trashServer.emojis.cache.find(emoji => emoji.id == shinyEmojiID);
          }
          eventName = eventName.replace(monName, `${monName} ${normalEmoji}${shinyEmoji}`);
        } //End of CDs
      } //End of emojis

      let event = {
        "name": eventName,
        "type": eventLinks[e]['type'],
        "link": `https://leekduck.com${eventLinks[e]['link']}`,
        "startTimeUnix": startTimeUnix,
        "startText": startText,
        "endTimeUnix": endTimeUnix,
        "endText": endText,
        "extraInfo": extraInfo.join(''),
        "tbaStart": isTBAStart,
        "tbaEnd": isTBAEnd
      }

      //Skip old events
      if (hoursUntilEnd < -12) {
        continue;
      }
      //Check skipping unannounced
      else if (config.ignoreUnannounced == true && event.name.includes('Unannounced')) {
        continue;
      }
      //Current events
      else if (hoursUntilStart <= 0.1 || (event.tbaStart && !event.tbaEnd && hoursUntilEnd > 0)) {
        currentEventsTemp.push(event);
      }
      //Future events
      else if (hoursUntilStart > 0.1) {
        //CD
        if (eventLinks[e]['type'] == "Community Day") {
          futureEventsCDTemp.push(event);
        }
        //Raid
        else if (util.eventTypesRaid && util.eventTypesRaid.includes(eventLinks[e]['type'])) {
          futureEventsRaidTemp.push(event);
        }
        else if (util.eventTypesSpotCase && util.eventTypesSpotCase.includes(eventLinks[e]['type'])) {
          futureEventsSpotCaseTemp.push(event);
        }
        else if (util.eventTypesMaxBattle && util.eventTypesMaxBattle.includes(eventLinks[e]['type'])) {
          futureEventsMaxBattleTemp.push(event);
        }
        //Other
        else {
          futureEventsOtherTemp.push(event);
        }
      }
    } catch (err) {
      console.log(err);
    }
  } //End of e loop

  //Delete old emojis
  var oldEmojis = [];
  let oldIDs = Object.values(emojiList);
  for (var e in oldIDs) {
    if (!Object.values(newEmojiList).includes(oldIDs[e])) {
      oldEmojis.push(oldIDs[e]);
    }
  }
  if (oldEmojis.length > 0) {
    deleteEmojis(oldEmojis);
  }
  fs.writeFileSync('./emojis.json', JSON.stringify(newEmojiList));

  //Current
  var currentEvents = _.sortBy(currentEventsTemp,
    [function (c) {
      return c.endTimeUnix
    }]);
  currentEvents = [...new Map(currentEvents.map(v => [JSON.stringify(v), v])).values()]
  var currentDescription = buildSection('## **__Current Events:__**', currentEvents, { showStart: false, showEnd: true, links: config.links });

  //Future CD
  var futureEventsCD = _.sortBy(futureEventsCDTemp,
    [function (f) {
      return f.startTimeUnix
    }]);
  futureEventsCD = [...new Map(futureEventsCD.map(v => [JSON.stringify(v), v])).values()]
  var futureDescriptionCD = buildSection('## **__Upcoming Community Days:__**', futureEventsCD, { showStart: true, showEnd: true, links: config.links });

  //Future Raid
  var futureEventsRaid = _.sortBy(futureEventsRaidTemp,
    [function (f) {
      return f.startTimeUnix
    }]);
  futureEventsRaid = [...new Map(futureEventsRaid.map(v => [JSON.stringify(v), v])).values()]
  var futureDescriptionRaid = buildSection('## **__Upcoming Raid Events:__**', futureEventsRaid, { showStart: true, showEnd: true, links: config.links });

  //Future SpotCase
  var futureEventsSpotCase = _.sortBy(futureEventsSpotCaseTemp,
    [function (f) {
      return f.startTimeUnix
    }]);
  futureEventsSpotCase = [...new Map(futureEventsSpotCase.map(v => [JSON.stringify(v), v])).values()]
  var futureDescriptionSpotCase = buildSection('## **__Upcoming Spotlights/Showcases:__**', futureEventsSpotCase, { showStart: true, showEnd: false, links: config.links });

  //Future Max Battle
  var futureEventsMaxBattle = _.sortBy(futureEventsMaxBattleTemp,
    [function (f) {
      return f.startTimeUnix
    }]);
    futureEventsMaxBattle = [...new Map(futureEventsMaxBattle.map(v => [JSON.stringify(v), v])).values()]
    var futureDescriptionMaxBattle = buildSection('## **__Upcoming Max Battles:__**', futureEventsMaxBattle, { showStart: true, showEnd: false, links: config.links });

  //Future Other
  var futureEventsOther = _.sortBy(futureEventsOtherTemp,
    [function (f) {
      return f.startTimeUnix
    }]);
  futureEventsOther = [...new Map(futureEventsOther.map(v => [JSON.stringify(v), v])).values()]
  var futureDescriptionOther = buildSection('## **__Other Upcoming Events:__**', futureEventsOther, { showStart: true, showEnd: true, links: config.links });

  let eventObj = {
    current: currentDescription,
    futureCD: futureDescriptionCD,
    futureRaid: futureDescriptionRaid,
    futureSpotCase: futureDescriptionSpotCase,
    futureMaxBattle: futureDescriptionMaxBattle,
    futureOther: futureDescriptionOther
  }
  fs.writeFileSync('./events.json', JSON.stringify(eventObj));

  if (newEventTypes.length > 0) {
    console.log(`New event type found: ${newEventTypes.join(', ')}. Please inform @RagingRectangle so they can push new update`);
  }
} //End of scrapeLinks()


async function cronUpdates() {
  let messageEmbeds = await createEmbeds();
  if (messageEmbeds == []) {
    return;
  }
  var eventMessages = JSON.parse(fs.readFileSync('./eventMessages.json'));

  for (const [channelId, messages] of Object.entries(eventMessages)) {
    try {
      let channel = await client.channels.fetch(channelId).catch(console.error);

      for (const [messageType, messageId] of Object.entries(messages)){
        let message = await channel.messages.fetch(messageId);
        let newEmbed = messageEmbeds[messageType];

        if (messageType == 'futureOther' && config.hideUpdateButton == false){
          var refreshButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(config.buttonLabel).setCustomId(`eventBotRefresh~${channelId}`).setStyle(ButtonStyle.Primary));
          if (config.emojiID) {
            refreshButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(config.buttonLabel).setCustomId(`eventBotRefresh~${channelId}`).setStyle(ButtonStyle.Primary).setEmoji(config.emojiID));
          }
          await message.edit({
            embeds: [newEmbed],
            components: [refreshButton]
          }).catch(console.error);
        }
        else {
          await message.edit({
            embeds: [newEmbed]
          }).catch(console.error);
        }
        await new Promise(done => setTimeout(done, 500));
      }//End of messages loop
    } catch (err) {
      console.log(err);
    }
  } //End of channel loop
} //End of cronUpdates()


//Buttons and Lists
client.on('interactionCreate', async interaction => {
  if (interaction.type !== InteractionType.MessageComponent) {
    return;
  }
  if (interaction.message.guildId === null) {
    return;
  }
  if (interaction.message.author.id != client.user.id) {
    return;
  }
  let user = interaction.member;

  if (interaction.customId.startsWith(`eventBotRefresh~`)) {
    await interaction.deferUpdate().catch(console.error);
    try {
      let eventMessages = JSON.parse(fs.readFileSync('./eventMessages.json'));
      let channelId = interaction.customId.replace(`eventBotRefresh~`, '');
      let messageData = eventMessages[channelId];
      if (!messageData){
        console.log(`Refresh button pressed for unknown message in channel ${channelId}`);
        return;
      }
      let messageEmbeds = await createEmbeds();
      if (messageEmbeds == []) {
        return;
      }
      for (const [messageType, messageId] of Object.entries(messageData)){
        var refreshButton = '';
        if (messageType == 'futureOther' && config.hideUpdateButton == false){
          refreshButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(config.buttonLabel).setCustomId(`eventBotRefresh~${channelId}`).setStyle(ButtonStyle.Primary));
          if (config.emojiID) {
            refreshButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(config.buttonLabel).setCustomId(`eventBotRefresh~${channelId}`).setStyle(ButtonStyle.Primary).setEmoji(config.emojiID));
          }
        }
        await updateMessage(channelId, messageId, messageEmbeds[messageType], refreshButton);
      }
    }
    catch(err){
      console.log(err);
    }

    async function updateMessage(channelId, messageId, messageEmbed, refreshButton){
      try{
        let channel = await client.channels.fetch(channelId).catch(console.error);
        let message = await channel.messages.fetch(messageId);

        if (refreshButton == ''){
          await message.edit({
            embeds: [messageEmbed],
          }).catch(console.error);
        }
        else {
          await message.edit({
            embeds: [messageEmbed],
            components: [refreshButton]
          }).catch(console.error);
        }
        return;
      }
      catch(err){
        console.log(err);
      }
      return;
    }//End of updateMessage()
  }
}); //End of buttons/lists


async function createEmoji(dexIndex) {
  return new Promise(async (resolve, reject) => {
    try {
      let emojiLink = `https://github.com/RagingRectangle/Pokemojis/blob/main/pokemon/${dexIndex}.gif?raw=true`;
      await trashServer.emojis.create({
          attachment: emojiLink,
          name: dexIndex
        })
        .then(emoji => {
          console.log(`${dexIndex} created: ${emoji.id}`);
          return resolve(emoji.id);
        });
    } catch (err) {
      console.log(err);
      return resolve(`ERROR`);
    }
  });
}; //End of createEmoji()


async function deleteEmojis(oldEmojis) {
  for (var i in oldEmojis) {
    try {
      let emojiCheck = await trashServer.emojis.cache.find(emoji => emoji.id == oldEmojis[i]);
      if (emojiCheck) {
        await emojiCheck.delete()
          .then(emoji => console.log(`Deleted emoji ${oldEmojis[i]}`))
          .catch(console.error);
      }
    } catch (err) {
      console.log(`Unable to delete emoji ${oldEmojis[i]}`)
    }
  }
} //End of deleteEmojis()


async function createEmbeds() {
  try {
    var messageEmbeds = {};
    var eventJSON = JSON.parse(fs.readFileSync('./events.json'));
    var currentEmbed = new EmbedBuilder()
      .setColor(config.colors.current)
      .setDescription(eventJSON.current.length == 1 ? `${eventJSON.current[0]}\n\nN/A` : eventJSON.current.join('\n\n'));
      messageEmbeds.current = currentEmbed;
    var futureCDEmbed = new EmbedBuilder()
      .setColor(config.colors.futureCD)
      .setDescription(eventJSON.futureCD.length == 1 ? `${eventJSON.futureCD[0]}\n\nN/A` : eventJSON.futureCD.join('\n\n'));
      messageEmbeds.futureCD = futureCDEmbed;
    var futureRaidEmbed = new EmbedBuilder()
      .setColor(config.colors.futureRaid)
      .setDescription(eventJSON.futureRaid.length == 1 ? `${eventJSON.futureRaid[0]}\n\nN/A` : eventJSON.futureRaid.join('\n\n'));
      messageEmbeds.futureRaid = futureRaidEmbed;
      var futureSpotCaseEmbed = new EmbedBuilder()
      .setColor(config.colors.futureSpotCase)
      .setDescription(eventJSON.futureSpotCase.length == 1 ? `${eventJSON.futureSpotCase[0]}\n\nN/A` : eventJSON.futureSpotCase.join('\n\n'));
      messageEmbeds.futureSpotCase = futureSpotCaseEmbed;
      var futureMaxBattleEmbed = new EmbedBuilder()
      .setColor(config.colors.futureMaxBattle ? config.colors.futureMaxBattle : 'FFFF00')
      .setDescription(eventJSON.futureMaxBattle.length == 1 ? `${eventJSON.futureMaxBattle[0]}\n\nN/A` : eventJSON.futureMaxBattle.join('\n\n'));
      messageEmbeds.futureMaxBattle = futureMaxBattleEmbed;

    var futureOtherEmbed = new EmbedBuilder()
      .setColor(config.colors.futureOther)
      .setDescription(eventJSON.futureOther.join('\n\n'))
      .setTimestamp();
      messageEmbeds.futureOther = futureOtherEmbed;
      
    return messageEmbeds;
  } catch (err) {
    console.log(err);
    return [];
  }
}; //End of createEmbeds()


//Slash commands
client.on('interactionCreate', async interaction => {
  if (interaction.type !== InteractionType.ApplicationCommand) {
    return;
  }
  if (interaction.applicationId != client.user.id) {
    return;
  }
  let user = interaction.user;
  if (user.bot == true) {
    return;
  }
  const command = await client.commands.get(interaction.commandName);
  if (!command) {
    return;
  }
  await interaction.deferReply().catch(console.error);

  if (interaction.commandName == 'events') {
    var eventMessages = JSON.parse(fs.readFileSync('./eventMessages.json'));
    let channelId = interaction.channelId;
    try {
      for (const [msgChannel, messages] of Object.entries(eventMessages)) {
        if (channelId == msgChannel){
          delete eventMessages[msgChannel];
        }
      }
      let messageEmbeds = await createEmbeds();
      if (messageEmbeds == []) {
        return;
      }
      var messageData = {};
      let messageTypes = ['current', 'futureCD', 'futureRaid', 'futureSpotCase', 'futureMaxBattle', 'futureOther'];
      for (var m = 0; m < messageTypes.length; m++){
        var refreshButton = '';
        if (messageTypes[m] == 'futureOther' && config.hideUpdateButton == false){
          refreshButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(config.buttonLabel).setCustomId(`eventBotRefresh~${channelId}`).setStyle(ButtonStyle.Primary));
          if (config.emojiID) {
            refreshButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(config.buttonLabel).setCustomId(`eventBotRefresh~${channelId}`).setStyle(ButtonStyle.Primary).setEmoji(config.emojiID));
          }
        }
        let messageId = await sendMessage(messageEmbeds[messageTypes[m]], refreshButton);
        messageData[messageTypes[m]] = messageId;
        await new Promise(done => setTimeout(done, 500));
      }

      eventMessages[channelId] = messageData;
      fs.writeFileSync('./eventMessages.json', JSON.stringify(eventMessages));

      async function sendMessage(messageEmbed, refreshButton){
        let sentMessage;
        if (refreshButton == ''){
          sentMessage = await interaction.channel.send({
            embeds: [messageEmbed],
          }).catch(console.error);
        }
        else {
          sentMessage = await interaction.channel.send({
            embeds: [messageEmbed],
            components: [refreshButton]
          }).catch(console.error);
        }
        if (!sentMessage) {
          console.log(`Failed to send message in channel ${channelId}`);
          return null;
        }
        return sentMessage.id;
      }//End of sendMessage()
    } catch (error) {
      console.error(error);
    }
    await interaction.deleteReply().catch(console.error);
  }
}); //End of slash commands


client.on("error", (e) => console.error(e));
client.on("warn", (e) => console.warn(e));
client.login(config.token);