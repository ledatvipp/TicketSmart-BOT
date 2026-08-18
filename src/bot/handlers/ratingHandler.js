// Rating: gửi DM 5-star sau khi ticket close + handle button click
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, MessageFlags,
} from 'discord.js';
import axios from 'axios';
import logger from '../utils/logger.js';

const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
const SECRET = process.env.BOT_API_SECRET;
const H = SECRET ? { 'X-Bot-Secret': SECRET } : {};

/**
 * Gửi DM rating cho user sau khi ticket close
 */
export async function sendRatingDM(client, ticket, resolution = {}) {
  try {
    if (!ticket.creatorId) return;
    const user = await client.users.fetch(ticket.creatorId).catch(() => null);
    if (!user) return;

    const staffName = resolution.staffName || ticket.claimerName;
    const reason = resolution.reason || ticket.closeReason || '';

    if (reason) {
      const imageUrl = reason.match(/https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?/i)?.[0];
      const resultEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle(`Ticket #${String(ticket.ticketNum).padStart(4, '0')} đã được xử lý`)
        .setDescription(reason)
        .addFields(
          { name: 'Staff hỗ trợ', value: staffName || 'Staff team', inline: true },
        )
        .setTimestamp();
      if (imageUrl) resultEmbed.setImage(imageUrl);

      await user.send({ embeds: [resultEmbed] }).catch(() => {});
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Gold)
      .setTitle(`⭐ Đánh giá Ticket #${String(ticket.ticketNum).padStart(4, '0')}`)
      .setDescription(
        `Ticket của bạn đã được xử lý${staffName ? ` bởi **${staffName}**` : ''}.\n` +
        `Bạn đánh giá trải nghiệm hỗ trợ này thế nào?`
      )
      .setFooter({ text: 'Bấm số sao tương ứng — feedback giúp chúng tôi cải thiện!' });

    const row = new ActionRowBuilder().addComponents(
      [1, 2, 3, 4, 5].map((s) =>
        new ButtonBuilder()
          .setCustomId(`rate:${ticket.id}:${s}`)
          .setLabel('⭐'.repeat(s))
          .setStyle(s >= 4 ? ButtonStyle.Success : s >= 3 ? ButtonStyle.Primary : ButtonStyle.Secondary),
      )
    );

    await user.send({ embeds: [embed], components: [row] }).catch(() => {});
  } catch (err) {
    logger.warn('Lỗi gửi rating DM:', err.message);
  }
}

/**
 * Handle button click rating
 */
export async function handleRatingButton(interaction) {
  const m = interaction.customId.match(/^rate:([^:]+):(\d+)$/);
  if (!m) return;
  const [, ticketId, scoreStr] = m;
  const score = parseInt(scoreStr);

  try {
    await axios.post(`${API_URL}/api/ratings`, {
      ticketId,
      raterId: interaction.user.id,
      score,
    }, { headers: H, timeout: 5000 });

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('✅ Cảm ơn bạn đã đánh giá!')
      .setDescription(`Bạn đã rate: ${'⭐'.repeat(score)}${'☆'.repeat(5 - score)}\n\nFeedback giúp chúng tôi cải thiện chất lượng hỗ trợ!`);

    await interaction.update({ embeds: [embed], components: [] }).catch(() => {});
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message || 'Lỗi';
    await interaction.reply({ content: '❌ ' + errMsg, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}
