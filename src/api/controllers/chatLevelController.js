import { prisma } from '../../lib/db.js';
import { cleanDiscordId, cleanEnum, cleanInteger, cleanString, ValidationError } from '../security/validation.js';
import {
  completeRewardGrant,
  deferRewardGrant,
  experienceForNextLevel,
  getChatLeaderboard,
  getChatLevelProfile,
  getChatLevelSetupStatus,
  leaseRewardGrants,
  retryRewardGrant,
} from '../../services/chatLevelService.js';

function positiveInteger(value, fallback, max, label) {
  return cleanInteger(value === undefined ? fallback : value, { min: 1, max, fallback, field: label });
}

function profilePayload(profile) {
  if (!profile) return { level: 0, experience: 0, totalExperience: 0, experienceForNextLevel: experienceForNextLevel(1), lastAwardedAt: null };
  return { ...profile, experienceForNextLevel: experienceForNextLevel(profile.level + 1) };
}

export async function getLeaderboard(req, res) {
  const guildId = cleanDiscordId(req.query.guildId || process.env.GUILD_ID, 'Guild ID');
  const limit = positiveInteger(req.query.limit, 10, 100, 'Leaderboard limit');
  const profiles = await getChatLeaderboard(guildId, limit);
  res.json({ success: true, data: profiles.map(profilePayload) });
}

export async function getProfile(req, res) {
  const guildId = cleanDiscordId(req.query.guildId || process.env.GUILD_ID, 'Guild ID');
  const userId = cleanDiscordId(req.params.userId, 'User ID');
  const profile = await getChatLevelProfile(guildId, userId);
  res.json({ success: true, data: { guildId, userId, ...profilePayload(profile) } });
}

export async function listGrants(req, res) {
  const guildId = cleanDiscordId(req.query.guildId || process.env.GUILD_ID, 'Guild ID');
  const take = positiveInteger(req.query.limit, 50, 200, 'Grant limit');
  const where = { guildId };
  if (req.query.userId) where.userId = cleanDiscordId(req.query.userId, 'User ID');
  if (req.query.status) where.status = cleanEnum(String(req.query.status).toUpperCase(), ['PENDING', 'LEASED', 'DEFERRED', 'COMPLETED', 'FAILED'], 'Grant status');
  const data = await prisma.chatLevelRewardGrant.findMany({ where, orderBy: { createdAt: 'desc' }, take });
  res.json({ success: true, data });
}

export async function retryGrant(req, res) {
  const ok = await retryRewardGrant(cleanString(req.params.id, { min: 1, max: 64, allowEmpty: false, field: 'Grant ID' }));
  if (!ok) return res.status(409).json({ success: false, message: 'Grant không thể retry (đã hoàn thành hoặc đang được lease)' });
  res.json({ success: true });
}

export async function getSetupStatus(req, res) {
  const guildId = cleanDiscordId(req.query.guildId || process.env.GUILD_ID, 'Guild ID');
  const data = await getChatLevelSetupStatus({ guildId });
  res.json({ success: true, data });
}

function minecraftGrantPayload(grant) {
  return {
    id: grant.id,
    guildId: grant.guildId,
    userId: grant.userId,
    level: grant.level,
    spins: grant.spins,
    leaseToken: grant.leaseToken,
    leaseExpiresAt: grant.leaseExpiresAt,
  };
}

export async function claimMinecraftGrants(req, res) {
  const grants = await leaseRewardGrants({
    minecraftServiceId: req.minecraftService.serverId,
    limit: positiveInteger(req.body?.limit, 20, 100, 'Claim limit'),
    leaseSeconds: positiveInteger(req.body?.leaseSeconds, 120, 900, 'Lease seconds'),
  });
  res.json({ success: true, data: grants.map(minecraftGrantPayload) });
}

export async function completeMinecraftGrant(req, res) {
  const grantId = cleanString(req.body?.grantId, { min: 1, max: 64, allowEmpty: false, field: 'Grant ID' });
  const leaseToken = cleanString(req.body?.leaseToken, { min: 16, max: 256, allowEmpty: false, field: 'Lease token' });
  const deliveryReference = req.body?.deliveryReference === undefined ? null : cleanString(req.body.deliveryReference, { max: 200, field: 'Delivery reference' });
  const ok = await completeRewardGrant({ grantId, leaseToken, minecraftServiceId: req.minecraftService.serverId, deliveryReference });
  if (!ok) return res.status(409).json({ success: false, code: 'GRANT_LEASE_INVALID', message: 'Grant lease không hợp lệ hoặc đã hết hạn' });
  res.json({ success: true });
}

export async function deferMinecraftGrant(req, res) {
  const grantId = cleanString(req.body?.grantId, { min: 1, max: 64, allowEmpty: false, field: 'Grant ID' });
  const leaseToken = cleanString(req.body?.leaseToken, { min: 16, max: 256, allowEmpty: false, field: 'Lease token' });
  const retryAfterSeconds = positiveInteger(req.body?.retryAfterSeconds, 60, 86_400, 'Retry delay');
  const reason = req.body?.reason === undefined ? null : cleanString(req.body.reason, { max: 500, field: 'Defer reason' });
  const ok = await deferRewardGrant({ grantId, leaseToken, minecraftServiceId: req.minecraftService.serverId, retryAfterSeconds, reason });
  if (!ok) return res.status(409).json({ success: false, code: 'GRANT_LEASE_INVALID', message: 'Grant lease không hợp lệ hoặc đã hết hạn' });
  res.json({ success: true });
}

export function chatLevelError(error, _req, res, next) {
  if (error instanceof ValidationError) return res.status(400).json({ success: false, code: error.code, message: error.message });
  return next(error);
}
