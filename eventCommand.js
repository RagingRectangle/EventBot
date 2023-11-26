const {
	SlashCommandBuilder
} = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('events')
		.setDescription('Get list of current and future PoGo events')
};