const {
  Collection
} = require('discord.js');
const fs = require('fs');

module.exports = {
  registerCommands: async function registerCommands(client, config) {
    var commands = [];
    const {
      REST
    } = require('@discordjs/rest');
    const {
      Routes
    } = require('discord-api-types/v10');
    const rest = new REST({
      version: '10'
    }).setToken(config.token);

    const command = require(`./eventCommand.js`);
    try {
      commands.push(command.data.toJSON());
    } catch (err) {
      console.log(err);
    }
    await rest.put(
        Routes.applicationCommands(client.user.id), {
          body: commands
        },
      ).then(() => console.log(`Registered Event Command`))
      .catch(console.error);
    client.commands = new Collection();
    client.commands.set(command.data.name, command);
  } //End of registerCommands()
}