import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getChatLeaderboard } from '../utils/api.js';
import { quietMentions } from '../ui/level-presentation.js';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Xem bảng xếp hạng chat')
  .addIntegerOption((option) => option.setName('limit').setDescription('Số hạng (1-20)').setMinValue(1).setMaxValue(20));

export function leaderboardEmbed(rows) {
  const lines = rows.map((row, index) => `**${index + 1}.** <@${row.userId}> — Level **${row.level}** • ${row.totalExperience} EXP`);
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('🏆 Chat Leaderboard')
    .setDescription(lines.length ? lines.join('\n') : 'Chưa có hoạt động XP hợp lệ.')
    .setTimestamp();
}

export async function execute(interaction) {
  const limit = interaction.options.getInteger('limit') || 10;
  await interaction.deferReply();
  await interaction.editReply({ embeds: [leaderboardEmbed(await getChatLeaderboard(limit))], allowedMentions: quietMentions });
}

export async function executePrefix(message, limit = 10) {
  await message.reply({ embeds: [leaderboardEmbed(await getChatLeaderboard(Math.min(20, Math.max(1, limit))))], allowedMentions: quietMentions });
}
