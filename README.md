# PoGO Event Bot

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
**Token:** Discord token for bot.

**timezoneOffset:** Also used for the last updated date in the footer.

**emojiID:** ID of an emoji if you want it included in the button.

**buttonLabel:** Text shown on the update button.

**ignoreUnannounced:** Whether unannounced events are shown or not.

**autoUpdate:** Update message automatically each hour.

**hideUpdateButton:** Hide button if autoUpdate = true (Will hide after 1st press).

**useEmojis:** Include emojis in event names when possible.

**trashServerID:** A trash server where the bot can create/delete emojis. Needs `Manage Expressions` permission.

**graphics:** Include links to event graphics when available.

**questReroll:** Include message for events with quest rerolls.

**rerollText:** Message to display for quest rerolls.

**bonus:** Include what the spotlight bonus is.

**24Hour:** Change times to 24 hour format.

**links:** Change event names to links to event website.

**colors:** Hex codes for embed colors.


## Usage
- Start the bot in a console with `node events.js`
- Can (*should*) use PM2 to run instead with `pm2 start events.js --name EventBot`


![Example](https://i.imgur.com/rZDEjJn.png)