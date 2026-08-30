import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { addChatExperience, setChatLevel } from '../../services/chatLevelService.js';
import { getChatLeaderboard, getChatLevelProfile, getChatRewardGrants, getConfig, retryChatRewardGrant } from '../utils/api.js';
import { profileEmbed, quietMentions, sendLevelPayload, withRankCard } from '../ui/level-presentation.js';

export const data = new SlashCommandBuilder()
  .setName('level')
  .setDescription('Xem và quản trị cấp độ chat')
  .addSubcommand((subcommand) => subcommand
    .setName('me')
    .setDescription('Xem cấp độ chat của bạn hoặc một thành viên')
    .addUserOption((option) => option.setName('user').setDescription('Thành viên cần xem')))
  .addSubcommand((subcommand) => subcommand
    .setName('top')
    .setDescription('Xem bảng xếp hạng chat')
    .addIntegerOption((option) => option.setName('limit').setDescription('Số hạng (1-20)').setMinValue(1).setMaxValue(20)))
  .addSubcommand((subcommand) => subcommand
    .setName('rewards')
    .setDescription('Xem reward Minecraft của bạn'))
  .addSubcommandGroup((group) => group.setName('admin').setDescription('Quản trị Level Chat')
    .addSubcommand((subcommand) => subcommand.setName('add-xp').setDescription('Cộng EXP cho thành viên')
      .addUserOption((option) => option.setName('user').setDescription('Thành viên').setRequired(true))
      .addIntegerOption((option) => option.setName('xp').setDescription('Số EXP').setRequired(true).setMinValue(1).setMaxValue(1_000_000)))
    .addSubcommand((subcommand) => subcommand.setName('set-level').setDescription('Đặt level cho thành viên')
      .addUserOption((option) => option.setName('user').setDescription('Thành viên').setRequired(true))
      .addIntegerOption((option) => option.setName('level').setDescription('Level mới').setRequired(true).setMinValue(0).setMaxValue(100_000)))
    .addSubcommand((subcommand) => subcommand.setName('sync-role').setDescription('Đồng bộ role level cao nhất')
      .addUserOption((option) => option.setName('user').setDescription('Thành viên (mặc định là bạn)')))
    .addSubcommand((subcommand) => subcommand.setName('retry-reward').setDescription('Đưa reward bị defer về hàng đợi')
      .addStringOption((option) => option.setName('grant-id').setDescription('Grant ID').setRequired(true))));

export function levelEmbed(user, profile) {
  return profileEmbed(user, profile);
}

export async function execute(interaction) {
  if (interaction.options.getSubcommandGroup(false) === 'admin') return executeAdmin(interaction);
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'top') {
    await interaction.deferReply();
    const rows = await getChatLeaderboard(interaction.options.getInteger('limit') || 10);
    const lines = rows.map((row, index) => `**${index + 1}.** <@${row.userId}> — Level **${row.level}** • ${row.totalExperience} EXP`);
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('🏆 Chat Leaderboard').setDescription(lines.join('\n') || 'Chưa có hoạt động XP hợp lệ.').setTimestamp()], allowedMentions: quietMentions });
  }
  if (subcommand === 'rewards') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const grants = await getChatRewardGrants(interaction.user.id);
    const lines = grants.map((grant) => `• Level **${grant.level}** — **${grant.spins}** spin(s): \`${grant.status}\``);
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎁 Minecraft rewards').setDescription(lines.join('\n') || 'Bạn chưa có reward Minecraft nào.').setTimestamp()] });
  }
  const user = interaction.options.getUser('user') || interaction.user;
  await interaction.deferReply();
  const [profile, config] = await Promise.all([getChatLevelProfile(user.id), levelConfig()]);
  const payload = await withRankCard(profileEmbed(user, profile, { config }), user, profile, { config, guildName: interaction.guild?.name });
  await sendLevelPayload((body) => interaction.editReply(body), payload);
}

async function levelConfig() {
  const response = await getConfig();
  const raw = response?.data || response || {};
  return raw.chatLevelConfig || {};
}

function canManageLevels(member, config) {
  if (member?.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  const roles = member?.roles?.cache;
  return Array.isArray(config.adminRoleIds) && config.adminRoleIds.some((roleId) => roles?.has(roleId));
}

async function syncHighestLevelRole(member, config) {
  const profile = await getChatLevelProfile(member.id);
  const roles = [...(config.levelRoles || [])].sort((a, b) => a.minLevel - b.minLevel);
  const highest = roles.filter((row) => row.minLevel <= profile.level).at(-1);
  if (highest && !member.roles.cache.has(highest.roleId)) await member.roles.add(highest.roleId, 'Level Chat admin sync');
  const stale = roles.map((row) => row.roleId).filter((roleId) => roleId !== highest?.roleId && member.roles.cache.has(roleId));
  if (stale.length) await member.roles.remove(stale, 'Level Chat admin sync');
  return { profile, highest };
}

async function executeAdmin(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const config = await levelConfig();
  if (!canManageLevels(interaction.member, config)) {
    return interaction.editReply('❌ Cần quyền Discord Administrator hoặc role admin Level Chat.');
  }
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  if (!guildId) return interaction.editReply('❌ Lệnh này chỉ dùng trong server Discord.');

  if (subcommand === 'add-xp') {
    const user = interaction.options.getUser('user', true);
    const result = await addChatExperience({ guildId, userId: user.id, experience: interaction.options.getInteger('xp', true), config });
    return interaction.editReply(`✅ Đã cộng **${result.gainedExperience} EXP** cho ${user}. Level hiện tại: **${result.profile.level}**.`);
  }
  if (subcommand === 'set-level') {
    const user = interaction.options.getUser('user', true);
    const result = await setChatLevel({ guildId, userId: user.id, level: interaction.options.getInteger('level', true), config });
    return interaction.editReply(`✅ Đã đặt ${user} thành **Level ${result.profile.level}**.`);
  }
  if (subcommand === 'sync-role') {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(user.id);
    const result = await syncHighestLevelRole(member, config);
    return interaction.editReply(`✅ Đã đồng bộ ${user}: ${result.highest ? `<@&${result.highest.roleId}>` : 'không có level role phù hợp'} (Level ${result.profile.level}).`);
  }
  if (subcommand === 'retry-reward') {
    const grantId = interaction.options.getString('grant-id', true);
    await retryChatRewardGrant(grantId);
    return interaction.editReply(`✅ Reward \`${grantId}\` đã được đưa về hàng đợi.`);
  }
  return interaction.editReply('❌ Subcommand không hợp lệ.');
}

export async function executePrefix(message, target = message.mentions.users.first() || message.author) {
  const [profile, config] = await Promise.all([getChatLevelProfile(target.id), levelConfig()]);
  const payload = await withRankCard(profileEmbed(target, profile, { config }), target, profile, { config, guildName: message.guild?.name });
  await sendLevelPayload((body) => message.reply(body), payload);
}
