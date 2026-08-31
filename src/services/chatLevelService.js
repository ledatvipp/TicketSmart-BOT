import crypto from 'crypto';
import { prisma } from '../lib/db.js';
import { ValidationError, cleanBoolean, cleanDiscordId, cleanInteger, cleanString, parseJsonObject } from '../api/security/validation.js';

export const DEFAULT_CHAT_LEVEL_CONFIG = Object.freeze({
  version: 1,
  enabled: false,
  requiredVerifiedRoleIds: ['1543196526946291783'],
  allowedChannelIds: [],
  xpPerMessage: 20,
  minContentLength: 10,
  cooldownSeconds: 60,
  similarityWindow: 10,
  similarityThreshold: 0.7,
  profanityTerms: ['đm', 'dmm', 'dcm', 'vcl', 'clm', 'fuck', 'shit', 'bitch'],
  profanityXpMultiplier: 0.5,
  levelRoles: [],
  rewardSpins: 1,
  rewardMilestones: [],
  minecraftServiceId: 'default',
  maxRewardAttempts: 12,
  rewardRetryBaseSeconds: 60,
  announcementEnabled: true,
  announcementChannelId: null,
  imageEnabled: true,
  accentColor: '#5865F2',
  adminRoleIds: [],
});

const MAX_CONFIG_BYTES = 20_000;
const DISCORD_ID = /^\d{15,22}$/;
const MINECRAFT_SERVICE_ID = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_REWARD_RETRY_SECONDS = 86_400;
// Discord dispatches message events concurrently. SQLite serializes writes, but an
// absolute profile update still loses progress when two transactions read the same
// profile first. Keep each guild/user award transition ordered in this bot process.
const awardQueues = new Map();

async function withAwardQueue(guildId, userId, operation) {
  const key = `${guildId}:${userId}`;
  const previous = awardQueues.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  awardQueues.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    // Do not remove a successor's queue entry.
    if (awardQueues.get(key) === current) awardQueues.delete(key);
  }
}

function idArray(value, label, maxItems = 50) {
  const values = Array.isArray(value) ? value : [];
  if (values.length > maxItems) throw new ValidationError(`${label} không được vượt quá ${maxItems} mục`);
  return [...new Set(values.map((id) => cleanDiscordId(id, label)))];
}

function optionalId(value, label) {
  if (value === null || value === undefined || value === '') return null;
  return cleanDiscordId(value, label);
}

function minecraftServiceId(value) {
  const id = cleanString(value, { min: 1, max: 64, allowEmpty: false, field: 'Minecraft service ID' });
  if (!MINECRAFT_SERVICE_ID.test(id)) throw new ValidationError('Minecraft service ID chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang');
  return id;
}

function profanityTerms(value) {
  const values = value ?? DEFAULT_CHAT_LEVEL_CONFIG.profanityTerms;
  if (!Array.isArray(values)) throw new ValidationError('Danh sách từ giảm XP phải là một mảng');
  if (values.length > 100) throw new ValidationError('Danh sách từ giảm XP không được vượt quá 100 mục');
  const unique = new Map();
  for (const value of values) {
    if (typeof value !== 'string') throw new ValidationError('Từ giảm XP phải là chuỗi ký tự');
    const term = cleanString(value, { min: 1, max: 64, allowEmpty: false, field: 'Từ giảm XP' });
    const normalized = normalizeChatContent(term);
    if (!normalized) throw new ValidationError('Từ giảm XP phải chứa chữ hoặc số');
    if (!unique.has(normalized)) unique.set(normalized, term);
  }
  return [...unique.values()];
}

function profanityXpMultiplier(value) {
  const multiplier = Number(value ?? DEFAULT_CHAT_LEVEL_CONFIG.profanityXpMultiplier);
  if (!Number.isFinite(multiplier) || multiplier < 0.1 || multiplier > 0.9) {
    throw new ValidationError('Tỷ lệ XP khi có từ giảm XP phải từ 0.1 đến 0.9');
  }
  return multiplier;
}

export function normalizeChatLevelConfig(value) {
  const source = value === undefined ? {} : parseJsonObject(value, {});
  const sourceJson = JSON.stringify(source);
  if (Buffer.byteLength(sourceJson, 'utf8') > MAX_CONFIG_BYTES) throw new ValidationError('Chat level config quá lớn');
  // Config is returned to the dashboard and bot. Credentials must never enter it,
  // including via extension objects submitted directly to the API.
  const pending = [source];
  while (pending.length) {
    const item = pending.pop();
    for (const [key, child] of Object.entries(item)) {
      if (/(?:token|secret|password|api[_-]?key|credential|(?:private|signing|encryption)[_-]?key)/i.test(key)) {
        throw new ValidationError('Cấu hình Level Chat không được chứa token, secret, mật khẩu hoặc API key');
      }
      if (child && typeof child === 'object') pending.push(child);
    }
  }
  const accentColor = source.accentColor ?? DEFAULT_CHAT_LEVEL_CONFIG.accentColor;
  if (typeof accentColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(accentColor)) {
    throw new ValidationError('Màu Level Chat phải có dạng #RRGGBB');
  }
  const requestedSimilarityThreshold = Number(source.similarityThreshold ?? DEFAULT_CHAT_LEVEL_CONFIG.similarityThreshold);
  if (!Number.isFinite(requestedSimilarityThreshold) || requestedSimilarityThreshold < 0.5 || requestedSimilarityThreshold > 1) {
    throw new ValidationError('Ngưỡng tương đồng phải từ 0.5 đến 1');
  }
  const config = {
    ...DEFAULT_CHAT_LEVEL_CONFIG,
    ...source,
    version: 1,
    enabled: cleanBoolean(source.enabled, DEFAULT_CHAT_LEVEL_CONFIG.enabled),
    requiredVerifiedRoleIds: idArray(source.requiredVerifiedRoleIds ?? DEFAULT_CHAT_LEVEL_CONFIG.requiredVerifiedRoleIds, 'Verified role ID'),
    allowedChannelIds: idArray(source.allowedChannelIds ?? [], 'Allowed channel ID', 100),
    xpPerMessage: cleanInteger(source.xpPerMessage ?? DEFAULT_CHAT_LEVEL_CONFIG.xpPerMessage, { min: 1, max: 100, field: 'XP mỗi tin nhắn' }),
    minContentLength: cleanInteger(source.minContentLength ?? DEFAULT_CHAT_LEVEL_CONFIG.minContentLength, { min: 1, max: 1000, field: 'Độ dài tối thiểu' }),
    cooldownSeconds: cleanInteger(source.cooldownSeconds ?? DEFAULT_CHAT_LEVEL_CONFIG.cooldownSeconds, { min: 0, max: 3600, field: 'Cooldown' }),
    similarityWindow: cleanInteger(source.similarityWindow ?? DEFAULT_CHAT_LEVEL_CONFIG.similarityWindow, { min: 1, max: 100, field: 'Cửa sổ so sánh' }),
    // Older 0.9 configs remain valid but are tightened to the 70% anti-repeat guarantee.
    similarityThreshold: Math.min(DEFAULT_CHAT_LEVEL_CONFIG.similarityThreshold, requestedSimilarityThreshold),
    profanityTerms: profanityTerms(source.profanityTerms),
    profanityXpMultiplier: profanityXpMultiplier(source.profanityXpMultiplier),
    minecraftServiceId: minecraftServiceId(source.minecraftServiceId ?? DEFAULT_CHAT_LEVEL_CONFIG.minecraftServiceId),
    maxRewardAttempts: cleanInteger(source.maxRewardAttempts ?? DEFAULT_CHAT_LEVEL_CONFIG.maxRewardAttempts, { min: 1, max: 100, field: 'Số lần thử thưởng tối đa' }),
    rewardRetryBaseSeconds: cleanInteger(source.rewardRetryBaseSeconds ?? DEFAULT_CHAT_LEVEL_CONFIG.rewardRetryBaseSeconds, { min: 1, max: 3600, field: 'Thời gian retry thưởng cơ bản' }),
    announcementEnabled: cleanBoolean(source.announcementEnabled, DEFAULT_CHAT_LEVEL_CONFIG.announcementEnabled),
    imageEnabled: cleanBoolean(source.imageEnabled, DEFAULT_CHAT_LEVEL_CONFIG.imageEnabled),
    accentColor: accentColor.toUpperCase(),
    announcementChannelId: optionalId(source.announcementChannelId, 'Announcement channel ID'),
    adminRoleIds: idArray(source.adminRoleIds ?? [], 'Admin role ID'),
  };
  const roleRows = Array.isArray(source.levelRoles) ? source.levelRoles : [];
  if (roleRows.length > 100) throw new ValidationError('Level roles không được vượt quá 100 mục');
  config.levelRoles = roleRows.map((row) => ({
    minLevel: cleanInteger(row?.minLevel, { min: 1, max: 100_000, field: 'Level role minLevel' }),
    roleId: cleanDiscordId(row?.roleId, 'Level role ID'),
  })).sort((a, b) => a.minLevel - b.minLevel || a.roleId.localeCompare(b.roleId));
  config.levelRoles = config.levelRoles.filter((row, index, rows) => index === 0 || row.roleId !== rows[index - 1].roleId);

  config.rewardSpins = cleanInteger(source.rewardSpins ?? DEFAULT_CHAT_LEVEL_CONFIG.rewardSpins, { min: 0, max: 100_000, field: 'Reward spins' });
  const milestoneRows = Array.isArray(source.rewardMilestones) ? source.rewardMilestones : [];
  if (milestoneRows.length > 100) throw new ValidationError('Reward milestones không được vượt quá 100 mục');
  const milestones = new Map();
  for (const row of milestoneRows) {
    const minLevel = cleanInteger(row?.minLevel, { min: 1, max: 100_000, field: 'Reward milestone minLevel' });
    milestones.set(minLevel, { minLevel, spins: cleanInteger(row?.spins, { min: 0, max: 100_000, field: 'Reward milestone spins' }) });
  }
  config.rewardMilestones = [...milestones.values()].sort((a, b) => a.minLevel - b.minLevel);

  const serialized = JSON.stringify(config);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_CONFIG_BYTES) throw new ValidationError('Chat level config quá lớn');
  return config;
}

export function serializeChatLevelConfig(value) {
  return JSON.stringify(normalizeChatLevelConfig(value));
}

export function parseChatLevelConfig(value) {
  try { return normalizeChatLevelConfig(value); }
  catch (error) {
    console.warn('[CHAT LEVEL CONFIG] Invalid stored config, using disabled default:', error.message);
    return { ...DEFAULT_CHAT_LEVEL_CONFIG, requiredVerifiedRoleIds: [...DEFAULT_CHAT_LEVEL_CONFIG.requiredVerifiedRoleIds] };
  }
}

export function experienceForNextLevel(nextLevel) {
  const level = Number(nextLevel);
  if (!Number.isInteger(level) || level < 1) throw new RangeError('nextLevel must be a positive integer');
  return 100 + (25 * (level - 1));
}

export function normalizeChatContent(content) {
  return String(content || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function usefulCharacterCount(content) {
  return [...normalizeChatContent(content).replace(/\s/g, '')].length;
}

export function contentSimilarity(left, right) {
  if (left === right) return 1;
  const a = new Set(String(left || '').split(' ').filter(Boolean));
  const b = new Set(String(right || '').split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsConfiguredProfanity(content, terms) {
  const comparableContent = String(content || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/https?:\/\/\S+/g, ' ');
  return terms.some((term) => {
    const characters = [...normalizeChatContent(term).replace(/\s/g, '')];
    if (!characters.length) return false;
    const pattern = characters.map(escapeRegExp).join('[^\\p{L}\\p{N}]*');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${pattern}(?=$|[^\\p{L}\\p{N}])`, 'u').test(comparableContent);
  });
}

function experienceForChatMessage(config, content) {
  const moderated = containsConfiguredProfanity(content, config.profanityTerms);
  return {
    moderated,
    experienceGained: moderated ? Math.floor(config.xpPerMessage * config.profanityXpMultiplier) : config.xpPerMessage,
  };
}

export function rewardSpinsForLevel(config, level) {
  let spins = config.rewardSpins;
  for (const milestone of config.rewardMilestones) {
    if (milestone.minLevel <= level) spins = milestone.spins;
    else break;
  }
  return spins;
}

function calculateProgress(profile, gainedExperience) {
  let level = profile.level;
  let experience = profile.experience + gainedExperience;
  const crossedLevels = [];
  while (experience >= experienceForNextLevel(level + 1)) {
    experience -= experienceForNextLevel(level + 1);
    level += 1;
    crossedLevels.push(level);
  }
  return { level, experience, crossedLevels };
}

async function createRewardGrants(tx, { guildId, userId, crossedLevels, config }) {
  const grants = [];
  for (const level of crossedLevels) {
    const spins = rewardSpinsForLevel(config, level);
    if (spins <= 0) continue;
    await tx.chatLevelRewardGrant.upsert({
      where: { guildId_userId_level: { guildId, userId, level } },
      create: {
        guildId,
        userId,
        level,
        spins,
        minecraftServiceId: config.minecraftServiceId,
        maxAttempts: config.maxRewardAttempts,
        retryBaseSeconds: config.rewardRetryBaseSeconds,
      },
      update: {},
    });
    grants.push({ guildId, userId, level, spins, minecraftServiceId: config.minecraftServiceId });
  }
  return grants;
}

function isUniqueError(error) {
  return error?.code === 'P2002';
}

/**
 * Award one qualifying Discord message. Database writes, levels and grants share
 * a transaction; Discord announcements and role mutations deliberately happen later.
 */
export async function awardChatMessage({ guildId, userId, messageId, channelId, content, memberRoleIds = [], config, now = new Date(), db = prisma }) {
  const normalizedConfig = normalizeChatLevelConfig(config);
  const normalizedContent = normalizeChatContent(content);
  if (!normalizedConfig.enabled) return { awarded: false, reason: 'disabled' };
  if (!DISCORD_ID.test(String(guildId)) || !DISCORD_ID.test(String(userId)) || !DISCORD_ID.test(String(messageId))) {
    throw new ValidationError('Guild, user và message ID phải là Discord ID hợp lệ');
  }
  if (String(content || '').trim().startsWith('!')) return { awarded: false, reason: 'command' };
  if (!normalizedConfig.allowedChannelIds.length) return { awarded: false, reason: 'allowlist_empty' };
  if (!normalizedConfig.allowedChannelIds.includes(String(channelId || ''))) return { awarded: false, reason: 'channel' };
  if (normalizedConfig.requiredVerifiedRoleIds.length && !normalizedConfig.requiredVerifiedRoleIds.some((id) => memberRoleIds.includes(id))) return { awarded: false, reason: 'role' };
  if (usefulCharacterCount(content) < normalizedConfig.minContentLength) return { awarded: false, reason: 'too_short' };

  return withAwardQueue(guildId, userId, async () => {
    try {
      return await db.$transaction(async (tx) => {
      const duplicate = await tx.chatLevelMessage.findUnique({ where: { guildId_messageId: { guildId, messageId } } });
      if (duplicate) return { awarded: false, reason: 'duplicate' };

      // Ledger entries for otherwise eligible messages are created before dynamic
      // anti-farm checks so a delayed Discord replay can never turn a rejected
      // cooldown/similarity message into earned XP.
      await tx.chatLevelMessage.create({ data: { guildId, userId, messageId, normalizedContent, awardedExperience: 0, createdAt: now } });

      const profile = await tx.chatLevelProfile.upsert({
        where: { guildId_userId: { guildId, userId } },
        create: { guildId, userId },
        update: {},
      });
      if (profile.lastAwardedAt && now.getTime() - profile.lastAwardedAt.getTime() < normalizedConfig.cooldownSeconds * 1000) {
        return { awarded: false, reason: 'cooldown' };
      }
      const recent = await tx.chatLevelMessage.findMany({
        where: { guildId, userId, awardedExperience: { gt: 0 } }, orderBy: { createdAt: 'desc' }, take: normalizedConfig.similarityWindow,
        select: { normalizedContent: true },
      });
      if (recent.some((row) => contentSimilarity(normalizedContent, row.normalizedContent) >= normalizedConfig.similarityThreshold)) {
        return { awarded: false, reason: 'similar' };
      }

      const { moderated, experienceGained } = experienceForChatMessage(normalizedConfig, content);
      if (experienceGained === 0) return { awarded: false, reason: 'profanity', moderated: true };
      const { level, experience, crossedLevels } = calculateProgress(profile, experienceGained);
      await tx.chatLevelMessage.update({
        where: { guildId_messageId: { guildId, messageId } },
        data: { awardedExperience: experienceGained },
      });
      const updated = await tx.chatLevelProfile.update({
        where: { guildId_userId: { guildId, userId } },
        data: { level, experience, totalExperience: { increment: experienceGained }, lastAwardedAt: now },
      });
      const grants = await createRewardGrants(tx, { guildId, userId, crossedLevels, config: normalizedConfig });
      return { awarded: true, experienceGained, moderated, profile: updated, crossedLevels, grants };
      });
    } catch (error) {
      if (isUniqueError(error)) return { awarded: false, reason: 'duplicate' };
      throw error;
    }
  });
}

export async function getChatLevelProfile(guildId, userId, db = prisma) {
  return db.chatLevelProfile.findUnique({ where: { guildId_userId: { guildId, userId } } });
}

/** Admin-only operation; callers must authorize before invoking it. */
export async function addChatExperience({ guildId, userId, experience, config, now = new Date(), db = prisma }) {
  const gainedExperience = cleanInteger(experience, { min: 1, max: 1_000_000, field: 'EXP' });
  const normalizedConfig = normalizeChatLevelConfig(config);
  return db.$transaction(async (tx) => {
    const profile = await tx.chatLevelProfile.upsert({
      where: { guildId_userId: { guildId, userId } }, create: { guildId, userId }, update: {},
    });
    const { level, experience: currentExperience, crossedLevels } = calculateProgress(profile, gainedExperience);
    const updated = await tx.chatLevelProfile.update({
      where: { guildId_userId: { guildId, userId } },
      data: { level, experience: currentExperience, totalExperience: { increment: gainedExperience }, lastAwardedAt: now },
    });
    const grants = await createRewardGrants(tx, { guildId, userId, crossedLevels, config: normalizedConfig });
    return { profile: updated, gainedExperience, crossedLevels, grants };
  });
}

function totalExperienceAtLevel(level) {
  let total = 0;
  for (let current = 1; current <= level; current += 1) total += experienceForNextLevel(current);
  return total;
}

/** Admin-only operation; setting a higher level also queues its missing rewards. */
export async function setChatLevel({ guildId, userId, level, config, now = new Date(), db = prisma }) {
  const targetLevel = cleanInteger(level, { min: 0, max: 100_000, field: 'Level' });
  const normalizedConfig = normalizeChatLevelConfig(config);
  return db.$transaction(async (tx) => {
    const profile = await tx.chatLevelProfile.upsert({
      where: { guildId_userId: { guildId, userId } }, create: { guildId, userId }, update: {},
    });
    const crossedLevels = targetLevel > profile.level
      ? Array.from({ length: targetLevel - profile.level }, (_value, index) => profile.level + index + 1)
      : [];
    const updated = await tx.chatLevelProfile.update({
      where: { guildId_userId: { guildId, userId } },
      data: { level: targetLevel, experience: 0, totalExperience: totalExperienceAtLevel(targetLevel), lastAwardedAt: now },
    });
    const grants = await createRewardGrants(tx, { guildId, userId, crossedLevels, config: normalizedConfig });
    return { profile: updated, crossedLevels, grants };
  });
}

export async function getChatLeaderboard(guildId, limit = 10, db = prisma) {
  return db.chatLevelProfile.findMany({ where: { guildId }, orderBy: [{ level: 'desc' }, { totalExperience: 'desc' }, { updatedAt: 'asc' }], take: Math.min(100, Math.max(1, limit)) });
}

function rewardRetryDelaySeconds(attemptCount, retryBaseSeconds, requestedSeconds = 0) {
  const exponent = Math.max(0, Math.min(30, Number(attemptCount || 1) - 1));
  const exponential = Math.min(MAX_REWARD_RETRY_SECONDS, Math.max(1, Number(retryBaseSeconds) || 60) * (2 ** exponent));
  return Math.min(MAX_REWARD_RETRY_SECONDS, Math.max(exponential, Number(requestedSeconds) || 0));
}

function deadLetterMessage(prefix, grant, reason = null) {
  const details = reason ? `: ${reason}` : '';
  return `${prefix} after ${grant.attemptCount}/${grant.maxAttempts} delivery attempts${details}`.slice(0, 500);
}

async function requeueExpiredRewardLeases(tx, { minecraftServiceId: serviceId, now }) {
  const expired = await tx.chatLevelRewardGrant.findMany({
    where: { minecraftServiceId: serviceId, status: 'LEASED', leaseExpiresAt: { lte: now } },
    orderBy: { createdAt: 'asc' },
  });
  for (const grant of expired) {
    const failed = grant.attemptCount >= grant.maxAttempts;
    const delaySeconds = rewardRetryDelaySeconds(grant.attemptCount, grant.retryBaseSeconds);
    await tx.chatLevelRewardGrant.updateMany({
      where: { id: grant.id, minecraftServiceId: serviceId, status: 'LEASED', leaseExpiresAt: { lte: now } },
      data: failed
        ? { status: 'FAILED', leaseToken: null, leaseExpiresAt: null, lastError: deadLetterMessage('Lease expired', grant) }
        : { status: 'DEFERRED', leaseToken: null, leaseExpiresAt: null, nextAttemptAt: new Date(now.getTime() + delaySeconds * 1000), lastError: `Lease expired; retrying in ${delaySeconds}s` },
    });
  }
}

export async function leaseRewardGrants({ minecraftServiceId: serviceId = 'default', limit = 20, leaseSeconds = 120, now = new Date(), db = prisma }) {
  const scopedServiceId = minecraftServiceId(serviceId);
  const take = Math.min(100, Math.max(1, Number(limit) || 20));
  const seconds = Math.min(900, Math.max(30, Number(leaseSeconds) || 120));
  return db.$transaction(async (tx) => {
    await requeueExpiredRewardLeases(tx, { minecraftServiceId: scopedServiceId, now });
    const candidates = await tx.chatLevelRewardGrant.findMany({
      where: { minecraftServiceId: scopedServiceId, status: { in: ['PENDING', 'DEFERRED'] }, nextAttemptAt: { lte: now } }, orderBy: { createdAt: 'asc' }, take,
    });
    const result = [];
    for (const candidate of candidates) {
      const leaseToken = crypto.randomBytes(24).toString('base64url');
      const leaseExpiresAt = new Date(now.getTime() + seconds * 1000);
      const claimed = await tx.chatLevelRewardGrant.updateMany({
        where: { id: candidate.id, minecraftServiceId: scopedServiceId, status: { in: ['PENDING', 'DEFERRED'] }, nextAttemptAt: { lte: now } },
        data: { status: 'LEASED', leaseToken, leaseExpiresAt, attemptCount: { increment: 1 } },
      });
      if (claimed.count === 1) result.push({ ...candidate, status: 'LEASED', leaseToken, leaseExpiresAt, attemptCount: candidate.attemptCount + 1 });
    }
    return result;
  });
}

export async function completeRewardGrant({ grantId, leaseToken, minecraftServiceId: serviceId = 'default', deliveryReference = null, now = new Date(), db = prisma }) {
  const scopedServiceId = minecraftServiceId(serviceId);
  const updated = await db.chatLevelRewardGrant.updateMany({
    where: { id: grantId, minecraftServiceId: scopedServiceId, status: 'LEASED', leaseToken, leaseExpiresAt: { gt: now } },
    data: { status: 'COMPLETED', completedAt: now, deliveryReference, leaseToken: null, leaseExpiresAt: null, lastError: null },
  });
  return updated.count === 1;
}

export async function deferRewardGrant({ grantId, leaseToken, minecraftServiceId: serviceId = 'default', retryAfterSeconds = 0, reason = null, now = new Date(), db = prisma }) {
  const scopedServiceId = minecraftServiceId(serviceId);
  return db.$transaction(async (tx) => {
    const grant = await tx.chatLevelRewardGrant.findFirst({
      where: { id: grantId, minecraftServiceId: scopedServiceId, status: 'LEASED', leaseToken, leaseExpiresAt: { gt: now } },
    });
    if (!grant) return false;
    const failed = grant.attemptCount >= grant.maxAttempts;
    const delaySeconds = rewardRetryDelaySeconds(grant.attemptCount, grant.retryBaseSeconds, retryAfterSeconds);
    const updated = await tx.chatLevelRewardGrant.updateMany({
      where: { id: grantId, minecraftServiceId: scopedServiceId, status: 'LEASED', leaseToken, leaseExpiresAt: { gt: now } },
      data: failed
        ? { status: 'FAILED', leaseToken: null, leaseExpiresAt: null, lastError: deadLetterMessage('Delivery deferred', grant, reason) }
        : { status: 'DEFERRED', nextAttemptAt: new Date(now.getTime() + delaySeconds * 1000), lastError: reason || `Delivery deferred; retrying in ${delaySeconds}s`, leaseToken: null, leaseExpiresAt: null },
    });
    return updated.count === 1;
  });
}

export async function retryRewardGrant(id, db = prisma, now = new Date()) {
  const updated = await db.chatLevelRewardGrant.updateMany({
    where: { id, status: { in: ['PENDING', 'DEFERRED', 'FAILED'] } },
    data: { status: 'PENDING', nextAttemptAt: now, attemptCount: 0, lastError: null, leaseToken: null, leaseExpiresAt: null },
  });
  return updated.count === 1;
}

export async function recordMinecraftServiceSeen(serverId, { now = new Date(), db = prisma } = {}) {
  const scopedServiceId = minecraftServiceId(serverId);
  return db.minecraftLevelServiceStatus.upsert({
    where: { serverId: scopedServiceId },
    create: { serverId: scopedServiceId, lastSeenAt: now },
    update: { lastSeenAt: now },
  });
}

export function buildChatLevelSetupStatus({ config, serviceStatus = null, grants = [] }) {
  const normalizedConfig = normalizeChatLevelConfig(config);
  const counts = { pending: 0, deferred: 0, failed: 0 };
  for (const row of grants) {
    const key = String(row.status || '').toLowerCase();
    if (Object.hasOwn(counts, key)) counts[key] += Number(row._count?.status ?? row.count ?? 0);
  }
  const remediation = [];
  if (!normalizedConfig.enabled) remediation.push('enable_chat_levels');
  if (!normalizedConfig.allowedChannelIds.length) remediation.push('add_allowed_channel');
  if (!serviceStatus?.lastSeenAt) remediation.push('connect_minecraft_service');
  if (counts.failed) remediation.push('retry_failed_rewards');
  return {
    ready: normalizedConfig.enabled && normalizedConfig.allowedChannelIds.length > 0 && Boolean(serviceStatus?.lastSeenAt),
    configEnabled: normalizedConfig.enabled,
    allowListPresent: normalizedConfig.allowedChannelIds.length > 0,
    minecraftServiceId: normalizedConfig.minecraftServiceId,
    serviceLastSeenAt: serviceStatus?.lastSeenAt || null,
    pendingCount: counts.pending,
    deferredCount: counts.deferred,
    failedCount: counts.failed,
    remediation,
  };
}

export async function getChatLevelSetupStatus({ guildId, db = prisma }) {
  const configRow = await db.guildConfig.findUnique({ where: { guildId }, select: { chatLevelConfig: true } });
  const config = parseChatLevelConfig(configRow?.chatLevelConfig);
  const [serviceStatus, grants] = await Promise.all([
    db.minecraftLevelServiceStatus.findUnique({ where: { serverId: config.minecraftServiceId } }),
    db.chatLevelRewardGrant.groupBy({
      by: ['status'],
      where: { guildId, minecraftServiceId: config.minecraftServiceId, status: { in: ['PENDING', 'DEFERRED', 'FAILED'] } },
      _count: { status: true },
    }),
  ]);
  return buildChatLevelSetupStatus({ config, serviceStatus, grants });
}
