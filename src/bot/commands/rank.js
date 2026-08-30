import { SlashCommandBuilder } from 'discord.js';
import { getChatLeaderboard, getChatLevelProfile, getConfig } from '../utils/api.js';
import { profileEmbed, sendLevelPayload, withRankCard } from '../ui/level-presentation.js';

export const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('Xem thứ hạng chat của bạn hoặc một thành viên')
  .addUserOption((option) => option.setName('user').setDescription('Thành viên cần xem'));

async function rankPayload(user) {
  const [profile, leaders, response] = await Promise.all([getChatLevelProfile(user.id), getChatLeaderboard(100), getConfig()]);
  const position = leaders.findIndex((item) => item.userId === user.id) + 1;
  return { profile, position: position || null, config: (response?.data || response || {}).chatLevelConfig || {} };
}

async function rankMessage(user, guildName) {
  const { profile, position, config } = await rankPayload(user);
  const embed = profileEmbed(user, profile, { position, config, rank: true });
  return withRankCard(embed, user, profile, { position, config, guildName });
}

export async function execute(interaction) {
  const user = interaction.options.getUser('user') || interaction.user;
  await interaction.deferReply();
  await sendLevelPayload((body) => interaction.editReply(body), await rankMessage(user, interaction.guild?.name));
}

export async function executePrefix(message, target = message.mentions.users.first() || message.author) {
  await sendLevelPayload((body) => message.reply(body), await rankMessage(target, message.guild?.name));
}
