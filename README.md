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

**ignoreTypes:** Array of event types to ignore. Full list at util.eventTypesAll.

**countdownThresholdHours:** How many hours before an event starts before switching to the countdown format.

**formatting:** Object containing custom timestamp formats for start and end times. See the Format Options section below.


## Format Options
Use Discord's dynamic timestamps to automatically adjust to each user's local timezone.

You can use a tool like [Hammertime](https://hammertime.cyou/en) to see available format characters.

You only need to provide the format character inside angle brackets (e.g., `<R>`), and the bot will automatically insert the correct event timestamp. 

**Available Options:**
- **startDate:** Format used for the start time before the countdown threshold is reached.
- **endDate:** Format used for the end time before the countdown threshold is reached.
- **startCountdown:** Format used for the start time once the event is within the countdown threshold.
- **endCountdown:** Format used for the end time once the event is within the countdown threshold.

**Placeholders:**
- `{d}`: The shortened date text (e.g., `Thu, Sep 17 @ 6 PM`).
- `<X>`: A Discord timestamp tag, where `X` is the format character. Examples: `<R>` (Relative), `<F>` (Full date/time).

**Example config.json section:**
```json
"formatting": {
  "startDate": "Starts {d} <R>",
  "endDate": "Ends {d} <R>",
  "startCountdown": "Starts {d} <R>",
  "endCountdown": "Ends {d} <R>"
}
```

## Usage
- Start the bot in a console with `node events.js`
- Can (*should*) use PM2 to run instead with `pm2 start events.js --name EventBot`


![Example](https://i.imgur.com/rZDEjJn.png)