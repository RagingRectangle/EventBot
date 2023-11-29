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
const tz = require('moment-timezone');
const schedule = require('node-schedule');
const SlashRegistry = require("./slashRegistry.js");
var config = require('./config.json');

//Auto update check
if (config.autoUpdate == true && !fs.existsSync('./autoUpdates.json')) {
  fs.writeFileSync('./autoUpdates.json', '{}');
}

client.on('ready', async () => {
  console.log("EventBot Logged In");
  fetchLeekEvents(client, 'boot');
  //Update events cron
  try {
    const cronJob = schedule.scheduleJob('eventCron', '0 * * * *', function () {
      fetchLeekEvents(client, 'cron');
    });
  } catch (err) {
    console.log(err);
  }
  //Register Slash Commands
  SlashRegistry.registerCommands(client, config);
}); //End of ready()


async function fetchLeekEvents(client, type) {
  try {
    const response = await fetch('https://leekduck.com/events/');
    const body = await response.text();
    const $ = cheerio.load(body);
    var eventLinks = [];
    $('.event-item-link').each((i, classEvent) => {
      let type = $(classEvent).find('p').first().text();
      let link = $(classEvent).attr('href');
      if (config.eventTypesAll.includes(type)) {
        eventLinks.push({
          type: type,
          link: link
        });
      }
    });
    scrapeLinks(client, eventLinks, type)
  } catch (err) {
    console.log(err);
  }
} //End of fetchLeekEvents()


async function scrapeLinks(client, eventLinks, type) {
  var currentEventsTemp = [];
  var futureEventsCDTemp = [];
  var futureEventsRaidTemp = [];
  var futureEventsSpotCaseTemp = [];
  var futureEventsOtherTemp = [];
  for (var e in eventLinks) {
    try {
      let eventResponse = await fetch(`https://leekduck.com${eventLinks[e]['link']}`);
      //console.log(`https://leekduck.com${eventLinks[e]['link']}`)
      const body = await eventResponse.text();
      const $ = cheerio.load(body);
      var name = $('.page-title').text();
      if (name.startsWith(' ')) {
        name = name.slice(1, name.length);
      }
      //Start Time
      //[ 'Wednesday', 'September', '20' ]
      var startDateSplit = $('#event-date-start').text().replaceAll('\n', '').replaceAll('  ', ' ').replaceAll(',', '').replaceAll('  ', ' ').split(' ');
      startDateSplit = startDateSplit.filter(a => a);
      //[ '6', 'PM', 'Local Time' ]
      let startTimeSplit = $('#event-time-start').text().replace('at', '').replace(':00', '').replaceAll('\n', '').replaceAll('  ', ' ').replaceAll(',', '').replaceAll('  ', ' ').split(' ');
      startTimeSplit = startTimeSplit.filter(a => a);
      var startHour = startTimeSplit[0] * 1;
      if (startTimeSplit[1] == 'PM') {
        startHour = startHour + 12;
      }
      //6 Mar 2017 21:22:23 GMT
      let startTimeUnix = moment(`${startDateSplit[2]} ${startDateSplit[1].slice(0,3)} ${config.months[startDateSplit[1]]} ${startHour}:00 GMT`).subtract(config.timezoneOffset, 'hours').format('X');
      let hoursUntilStart = (startTimeUnix - moment(new Date()).format('X')) / 60 / 60;
      let startText = `${startDateSplit[0].slice(0,3)}, ${startDateSplit[1].slice(0,3)} ${startDateSplit[2]} @ ${startTimeSplit[0]} ${startTimeSplit[1]}`;

      //End Time
      //[ 'Wednesday', 'September', '20' ]
      let endDateSplit = $('#event-date-end').text().replaceAll('\n', '').replaceAll('  ', ' ').replaceAll(',', '').replaceAll('  ', ' ').split(' ');
      endDateSplit = endDateSplit.filter(a => a);
      //[ '6', 'PM', 'Local Time' ]
      let endTimeSplit = $('#event-time-end').text().replace('at', '').replace(':00', '').replaceAll('\n', '').replaceAll('  ', ' ').replaceAll(',', '').replaceAll('  ', ' ').split(' ');
      endTimeSplit = endTimeSplit.filter(a => a);
      var endHour = endTimeSplit[0] * 1;
      if (endTimeSplit[1] == 'PM') {
        endHour = endHour + 12;
      }
      //6 Mar 2017 21:22:23 GMT
      let endTimeUnix = moment(`${endDateSplit[2]} ${endDateSplit[1].slice(0,3)} ${config.months[endDateSplit[1]]} ${endHour}:00 GMT`).subtract(config.timezoneOffset, 'hours').format('X');
      let hoursUntilEnd = (endTimeUnix - moment(new Date()).format('X')) / 60 / 60;
      let endText = `${endDateSplit[0].slice(0,3)}, ${endDateSplit[1].slice(0,3)} ${endDateSplit[2]} @ ${endTimeSplit[0]} ${endTimeSplit[1]}`;

      let event = {
        "name": name.replaceAll(' ', ' ').replace('PokéStop Showcases', 'Showcases').replace('5-star Raid Battles', '5* Raids').replace('in Shadow Raids', 'Raids').replace('in Mega Raids', 'Raids').replace('Community Day', 'CD'),
        "type": eventLinks[e]['type'],
        "link": `https://leekduck.com${eventLinks[e]['link']}`,
        "startTimeUnix": startTimeUnix,
        "startText": startText,
        "endTimeUnix": endTimeUnix,
        "endText": endText
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
      else if (hoursUntilStart < 0) {
        currentEventsTemp.push(event);
      }
      //Future events
      else if (hoursUntilStart > 0) {
        //CD
        if (eventLinks[e]['type'] == "Community Day") {
          futureEventsCDTemp.push(event);
        }
        //Raid
        else if (config.eventTypesRaid.includes(eventLinks[e]['type'])) {
          futureEventsRaidTemp.push(event);
        }
        //Spotlight/Showcase
        else if (config.eventTypesSpotCase.includes(eventLinks[e]['type'])) {
          futureEventsSpotCaseTemp.push(event);
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

  //Current
  var currentEvents = _.sortBy(currentEventsTemp,
    [function (c) {
      return c.endTimeUnix
    }]);
  currentEvents = [...new Map(currentEvents.map(v => [JSON.stringify(v), v])).values()]
  var currentDescription = ['## **__Current Events:__**'];
  for (var c in currentEvents) {
    //Skip Leek links
    if (currentEventsTemp.type == 'Pokémon Spotlight Hour' || currentEventsTemp.type == 'Raid Hour' || currentEventsTemp.type == 'PokéStop Showcase') {
      currentDescription.push(`${currentEvents[c]['name']}\n- Ends ${currentEvents[c]['endText']} <t:${currentEvents[c]['endTimeUnix']}:R>`);
    }
    //Include link
    else {
      currentDescription.push(`[${currentEvents[c]['name']}](${currentEvents[c]['link']})\n- Ends ${currentEvents[c]['endText']} <t:${currentEvents[c]['endTimeUnix']}:R>`);
    }
  } //End of c loop

  //Future CD
  var futureEventsCD = _.sortBy(futureEventsCDTemp,
    [function (f) {
      return f.startTimeUnix
    }]);
  futureEventsCD = [...new Map(futureEventsCD.map(v => [JSON.stringify(v), v])).values()]
  var futureDescriptionCD = ['## **__Upcoming Community Days:__**'];
  for (var f in futureEventsCD) {
    futureDescriptionCD.push(`[${futureEventsCD[f]['name']}](${futureEventsCD[f]['link']})\n- Starts ${futureEventsCD[f]['startText']} <t:${futureEventsCD[f]['startTimeUnix']}:R>\n- Ends ${futureEventsCD[f]['endText']} <t:${futureEventsCD[f]['endTimeUnix']}:R>`);
  } //End of f loop

  //Future Raid
  var futureEventsRaid = _.sortBy(futureEventsRaidTemp,
    [function (f) {
      return f.startTimeUnix
    }]);
  futureEventsRaid = [...new Map(futureEventsRaid.map(v => [JSON.stringify(v), v])).values()]
  var futureDescriptionRaid = ['## **__Upcoming Raid Events:__**'];
  for (var f in futureEventsRaid) {
    //Raid Hour
    if (futureEventsRaid[f]['type'] == 'Raid Hour') {
      futureDescriptionRaid.push(`${futureEventsRaid[f]['name']}\n- Starts ${futureEventsRaid[f]['startText']} <t:${futureEventsRaid[f]['startTimeUnix']}:R>`);
    } else {
      futureDescriptionRaid.push(`[${futureEventsRaid[f]['name']}](${futureEventsRaid[f]['link']})\n- Starts ${futureEventsRaid[f]['startText']} <t:${futureEventsRaid[f]['startTimeUnix']}:R>\n- Ends ${futureEventsRaid[f]['endText']} <t:${futureEventsRaid[f]['endTimeUnix']}:R>`);
    }
    if (futureDescriptionRaid.join('\n\n').length > 3000) {
      futureDescriptionRaid.pop();
      break;
    }
  } //End of f loop

  //Future SpotCase
  var futureEventsSpotCase = _.sortBy(futureEventsSpotCaseTemp,
    [function (f) {
      return f.startTimeUnix
    }]);
  futureEventsSpotCase = [...new Map(futureEventsSpotCase.map(v => [JSON.stringify(v), v])).values()]
  var futureDescriptionSpotCase = ['## **__Upcoming Spotlights/Showcases:__**'];
  for (var f in futureEventsSpotCase) {
    futureDescriptionSpotCase.push(`${futureEventsSpotCase[f]['name']}\n- Starts ${futureEventsSpotCase[f]['startText']} <t:${futureEventsSpotCase[f]['startTimeUnix']}:R>`);
    if (futureDescriptionSpotCase.join('\n\n').length > 3000) {
      futureDescriptionSpotCase.pop();
      break;
    }
  } //End of f loop

  //Future Other
  var futureEventsOther = _.sortBy(futureEventsOtherTemp,
    [function (f) {
      return f.startTimeUnix
    }]);
  futureEventsOther = [...new Map(futureEventsOther.map(v => [JSON.stringify(v), v])).values()]
  var futureDescriptionOther = ['## **__Other Upcoming Events:__**'];
  for (var f in futureEventsOther) {
    //Unannounced
    if (futureEventsOther[f]['name'].includes('Unannounced Event')) {
      futureDescriptionOther.push(`[${futureEventsOther[f]['name']}](${futureEventsOther[f]['link']})`);
    } else {
      futureDescriptionOther.push(`[${futureEventsOther[f]['name']}](${futureEventsOther[f]['link']})\n- Starts ${futureEventsOther[f]['startText']} <t:${futureEventsOther[f]['startTimeUnix']}:R>\n- Ends ${futureEventsOther[f]['endText']} <t:${futureEventsOther[f]['endTimeUnix']}:R>`);
    }
  } //End of f loop

  let eventObj = {
    current: currentDescription,
    futureCD: futureDescriptionCD,
    futureRaid: futureDescriptionRaid,
    futureSpotCase: futureDescriptionSpotCase,
    futureOther: futureDescriptionOther
  }
  fs.writeFileSync('./events.json', JSON.stringify(eventObj));

  //Auto updates
  if (type == 'cron' && config.autoUpdate == true) {
    cronUpdates();
  }
} //End of scrapeLinks()


async function cronUpdates() {
  let eventEmbeds = await createEmbeds();
  if (eventEmbeds == []) {
    return;
  }
  var autoMessages = JSON.parse(fs.readFileSync('./autoUpdates.json'));
  for (const [msgID, channelID] of Object.entries(autoMessages)) {
    try {
      let channel = await client.channels.fetch(channelID).catch(console.error);
      let message = await channel.messages.fetch(msgID);
      var eventComponent = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(config.buttonLabel).setCustomId(`eventBot~refresh`).setStyle(ButtonStyle.Primary));
      if (config.emojiID) {
        eventComponent = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(config.buttonLabel).setCustomId(`eventBot~refresh`).setStyle(ButtonStyle.Primary).setEmoji(config.emojiID));
      }
      var components = [eventComponent];
      if (config.autoUpdate == true && config.hideUpdateButton == true) {
        components = [];
      }
      message.edit({
        embeds: eventEmbeds,
        components: components
      }).catch(console.error);
    } catch (err) {
      console.log(err);
    }
  } //End of message loop
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
  await interaction.deferReply({
    ephemeral: true
  }).catch(console.error);
  if (interaction.customId == `eventBot~refresh`) {
    try {
      let eventEmbeds = await createEmbeds();
      if (eventEmbeds == []) {
        return;
      }
      if (config.autoUpdate == true && config.hideUpdateButton == true){
        await interaction.message.edit({
          embeds: eventEmbeds,
          components: []
        }).catch(console.error);
      }
      else {
        await interaction.message.edit({
          embeds: eventEmbeds
        }).catch(console.error);
      }
    } catch (err) {
      console.log(err);
    }
    await interaction.deleteReply().catch(console.error);

    //Check auto update
    if (config.autoUpdate == true) {
      var autoMessages = JSON.parse(fs.readFileSync('./autoUpdates.json'));
      //New auto update
      if (!autoMessages[interaction.message.id]) {
        autoMessages[interaction.message.id] = interaction.message.channel.id;
        fs.writeFileSync('./autoUpdates.json', JSON.stringify(autoMessages));
      }
    }
  }
}); //End of buttons/lists


async function createEmbeds() {
  var embeds = [];
  try {
    var eventJSON = JSON.parse(fs.readFileSync('./events.json'));
    var currentEmbed = new EmbedBuilder()
      .setColor(config.colors.current)
      .setDescription(eventJSON.current.length == 1 ? `${eventJSON.current[0]}\n\nN/A` : eventJSON.current.join('\n\n'));
    embeds.push(currentEmbed);
    var futureCDEmbed = new EmbedBuilder()
      .setColor(config.colors.futureCD)
      .setDescription(eventJSON.futureCD.length == 1 ? `${eventJSON.futureCD[0]}\n\nN/A` : eventJSON.futureCD.join('\n\n'));
    embeds.push(futureCDEmbed);
    var futureRaidEmbed = new EmbedBuilder()
      .setColor(config.colors.futureRaid)
      .setDescription(eventJSON.futureRaid.length == 1 ? `${eventJSON.futureRaid[0]}\n\nN/A` : eventJSON.futureRaid.join('\n\n'));
    embeds.push(futureRaidEmbed);
    var futureSpotCaseEmbed = new EmbedBuilder()
      .setColor(config.colors.futureSpotCase)
      .setDescription(eventJSON.futureSpotCase.length == 1 ? `${eventJSON.futureSpotCase[0]}\n\nN/A` : eventJSON.futureSpotCase.join('\n\n'));
    embeds.push(futureSpotCaseEmbed);
    var futureOtherEmbed = new EmbedBuilder()
      .setColor(config.colors.futureOther)
      .setDescription(eventJSON.futureOther.join('\n\n'))
      .setTimestamp();
    if (eventJSON.futureOther.length > 1) {
      embeds.push(futureOtherEmbed);
    }
    return embeds;
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
    try {
      let eventEmbeds = await createEmbeds();
      if (eventEmbeds == []) {
        return;
      }
      var eventComponent = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(config.buttonLabel).setCustomId(`eventBot~refresh`).setStyle(ButtonStyle.Primary));
      if (config.emojiID) {
        eventComponent = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(config.buttonLabel).setCustomId(`eventBot~refresh`).setStyle(ButtonStyle.Primary).setEmoji(config.emojiID));
      }
      var components = [eventComponent];
      await interaction.editReply({
        embeds: eventEmbeds,
        components: components
      }).catch(console.error);
    } catch (error) {
      console.error(error);
    }
  }
}); //End of slash commands


client.on("error", (e) => console.error(e));
client.on("warn", (e) => console.warn(e));
client.login(config.token);