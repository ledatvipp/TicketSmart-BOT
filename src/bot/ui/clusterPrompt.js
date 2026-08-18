import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { mergeClusters } from '../../clusters/clusterCatalog.js';

export function buildClusterPrompt({ clusters = [], userId, detectionId = 'none', reason = 'Để trả lời đúng hệ thống, mình cần biết bạn đang chơi cụm nào.' }) {
  const active = mergeClusters(clusters).slice(0, 10);
  const rows = [];
  for (let i = 0; i < active.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(
      ...active.slice(i, i + 5).map((cluster) => new ButtonBuilder()
        .setCustomId(`smart:cluster:${cluster.key}:${userId}:${detectionId}`)
        .setLabel(cluster.name.slice(0, 80))
        .setEmoji(cluster.emoji || '🗺️')
        .setStyle(i === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)),
    ));
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: 'IS7MC Multi-Cluster Router' })
    .setTitle('🗺️ Bạn đang hỏi về cụm nào?')
    .setDescription(reason)
    .addFields({
      name: '⚡ CHỌN NHANH',
      value: 'Bấm đúng cụm ở dưới. Bot sẽ giữ lựa chọn này cho các câu hỏi tiếp theo trong cuộc trò chuyện.',
      inline: false,
    })
    .setFooter({ text: 'Không chọn nhầm cụm • Không trộn lẫn lệnh, giá hoặc cơ chế' })
    .setTimestamp();

  return {
    embeds: [embed],
    components: rows,
    metadata: { awaitingCluster: true, clusterChoices: active.map((item) => item.key) },
  };
}
