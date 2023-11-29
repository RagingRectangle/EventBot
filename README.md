# PoGO Events Bot

## About
A Discord bot for displaying current and future PoGO events.

Join the Discord server for any help and to keep up with updates: https://discord.gg/USxvyB9QTz


## Requirements
 - **New Discord bot with token** (If using an old bot that also uses /slash commands, those will be overridden)
 

## Install
```
git clone https://github.com/RagingRectangle/EventBot.git
cd EventBot
cp config.json.example config.json
npm install
```

## Config Setup
**Token:** Discord token used for Poracle bot.

**timezoneOffset:** Only used for the last updated date in the footer.

**emojiID:** ID of an emoji if you want it included in the button.

**buttonLabel:** Text shown on the update button.

**ignoreUnannounced:** Whether unannounced events are shown or not.

**autoUpdate:** Update message automatically. Must press the update button 1 time to activate.

**hideUpdateButton:** Hide button if autoUpdate = true (Will hide after 1st press).

**colors:** Hex codes for embed colors.

**months:** Years aren't included when scraping so this was my lazy solution. Will just need to update them every once in awhile.

**eventTypes:** Can ignore these unless you don't want to include certain types or there are new ones in the future.


## Usage
- Start the bot in a console with `node events.js`
- Can (*should*) use PM2 to run instead with `pm2 start events.js --name EventBot`


![Example](https://i.imgur.com/rZDEjJn.png)