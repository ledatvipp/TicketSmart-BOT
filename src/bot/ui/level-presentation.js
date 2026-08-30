import { AttachmentBuilder, EmbedBuilder, escapeMarkdown } from 'discord.js';
import { cardAccent, cardProgress, renderRankCard } from '../utils/rank-card.js';

const format = new Intl.NumberFormat('vi-VN');
export const quietMentions = Object.freeze({ parse: [], repliedUser: false });

export function profileEmbed(user, profile, { config = {}, position, rank = false } = {}) {
  const { level, needed, experience, total, ratio } = cardProgress(profile);
  const bars = Math.floor(ratio * 12);
  return new EmbedBuilder()
    .setColor(cardAccent(config.accentColor))
    .setAuthor({ name: `${String(user.username || 'Thành viên').slice(0, 80)} • Level Chat`, iconURL: user.displayAvatarURL?.() })
    .setDescription(`**${escapeMarkdown(user.displayName || user.username || 'Thành viên')}** · Level **${format.format(level)}**\n` +
      `\`${'▰'.repeat(bars)}${'▱'.repeat(12 - bars)}\` **${Math.floor(ratio * 100)}%**`)
    .addFields(
      { name: 'Tiến độ cấp tiếp theo', value: `${format.format(experience)} / ${format.format(needed)} XP`, inline: true },
      { name: 'Tổng tích lũy', value: `${format.format(total)} XP`, inline: true },
      ...(rank ? [{ name: 'Xếp hạng', value: position ? `#${position}` : 'Ngoài top 100', inline: true }] : []),
    )
    .setFooter({ text: 'Trò chuyện có ý nghĩa · Cùng xây dựng cộng đồng' });
}

export function levelUpEmbed(user, result, config = {}) {
  const { level, needed, experience } = cardProgress(result.profile);
  const spins = result.grants.reduce((total, grant) => total + grant.spins, 0);
  return new EmbedBuilder()
    .setColor(cardAccent(config.accentColor))
    .setAuthor({ name: 'Một cột mốc mới!', iconURL: user.displayAvatarURL?.() })
    .setTitle(`CHÚC MỪNG · LEVEL ${format.format(level)}`)
    .setDescription(`${user} vừa lên cấp! Tiếp tục trò chuyện và chinh phục những cột mốc tiếp theo.`)
    .addFields(
      { name: 'XP vừa nhận', value: `+${format.format(result.experienceGained)} XP`, inline: true },
      { name: 'Cấp tiếp theo', value: `${format.format(experience)} / ${format.format(needed)} XP`, inline: true },
      ...(spins ? [{ name: 'Phần thưởng Minecraft', value: `**${format.format(spins)} lượt quay** đã vào hàng đợi cấp thưởng.`, inline: false }] : []),
    )
    .setFooter({ text: 'LEVEL CHAT • Mỗi đóng góp đều được ghi nhận' })
    .setTimestamp();
}

export async function withRankCard(embed, user, profile, { config = {}, guildName, position, levelUp = false, render = renderRankCard } = {}) {
  const payload = { embeds: [embed], allowedMentions: quietMentions };
  if (config.imageEnabled === false) return payload;
  try {
    const png = await render({
      username: user.displayName || user.username,
      avatarUrl: user.displayAvatarURL?.({ extension: 'png', size: 256, forceStatic: true }),
      guildName, profile, position, levelUp, accentColor: config.accentColor,
    });
    if (!png) return payload;
    const attachment = new AttachmentBuilder(png, { name: 'level-card.png', description: `Level ${profile?.level || 0} — tiến độ chat của ${user.username || 'thành viên'}` });
    embed.setImage('attachment://level-card.png');
    return { ...payload, files: [attachment] };
  } catch { return payload; }
}

export async function sendLevelPayload(send, payload) {
  try { return await send(payload); }
  catch (error) {
    // Only retry definite Discord rejections, never ambiguous transport errors
    // that could otherwise duplicate an already delivered announcement.
    if (!payload.files?.length || ![50013, 50035].includes(error?.code)) throw error;
    const { files, ...fallback } = payload;
    fallback.embeds = payload.embeds.map((embed) => EmbedBuilder.from(embed).setImage(null));
    return send(fallback);
  }
}
