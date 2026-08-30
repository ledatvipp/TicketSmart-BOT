import crypto from 'crypto';
import { recordMinecraftServiceSeen } from '../../services/chatLevelService.js';

const MAX_CLOCK_SKEW_SECONDS = 300;
const NONCE_TTL_MS = (MAX_CLOCK_SKEW_SECONDS * 2) * 1000;
const nonces = new Map();
const SERVER_ID = /^[A-Za-z0-9._-]{1,64}$/;
const NONCE = /^[A-Za-z0-9._:-]{8,128}$/;

export function sha256Hex(body) {
  return crypto.createHash('sha256').update(String(body || ''), 'utf8').digest('hex');
}

export function minecraftCanonicalRequest({ method, path, timestamp, nonce, contentSha256, serverId }) {
  return [String(method).toUpperCase(), path, String(timestamp), nonce, contentSha256, serverId].join('\n');
}

export function resolveMinecraftLevelSecret(serverId, env = process.env) {
  let map = {};
  if (env.MINECRAFT_LEVEL_SERVICE_SECRETS) {
    try { map = JSON.parse(env.MINECRAFT_LEVEL_SERVICE_SECRETS); }
    catch { return null; }
  }
  if (map && typeof map === 'object' && typeof map[serverId] === 'string' && map[serverId]) return map[serverId];
  const named = `MINECRAFT_LEVEL_SERVICE_SECRET_${String(serverId).replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`;
  if (env[named]) return env[named];
  return serverId === 'default' && env.MINECRAFT_LEVEL_SERVICE_SECRET ? env.MINECRAFT_LEVEL_SERVICE_SECRET : null;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function pruneNonces(now) {
  for (const [key, expiresAt] of nonces) if (expiresAt <= now) nonces.delete(key);
}

export function resetMinecraftLevelReplayCache() {
  nonces.clear();
}

/** Compatible with LobbySign ApiRequestSigner: X-LeDat-* and base64url HMAC. */
export function requireMinecraftLevelSignature(req, res, next) {
  const serverId = String(req.headers['x-ledat-server'] || '');
  const timestamp = String(req.headers['x-ledat-timestamp'] || '');
  const nonce = String(req.headers['x-ledat-nonce'] || '');
  const declaredHash = String(req.headers['x-ledat-content-sha256'] || '').toLowerCase();
  const signature = String(req.headers['x-ledat-signature'] || '');
  if (!SERVER_ID.test(serverId) || !NONCE.test(nonce) || !/^\d{1,12}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(declaredHash) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) {
    return res.status(401).json({ success: false, code: 'MINECRAFT_SIGNATURE_INVALID', message: 'Minecraft signature không hợp lệ' });
  }
  const timestampSeconds = Number(timestamp);
  const now = Date.now();
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Math.floor(now / 1000) - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) {
    return res.status(401).json({ success: false, code: 'MINECRAFT_SIGNATURE_EXPIRED', message: 'Minecraft signature hết hạn' });
  }
  const rawBody = req.rawBody ?? JSON.stringify(req.body ?? {});
  const actualHash = sha256Hex(rawBody);
  if (!safeEqual(declaredHash, actualHash)) {
    return res.status(401).json({ success: false, code: 'MINECRAFT_BODY_HASH_INVALID', message: 'Minecraft body hash không hợp lệ' });
  }
  const secret = resolveMinecraftLevelSecret(serverId);
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32 || Buffer.byteLength(secret, 'utf8') > 4096) {
    return res.status(503).json({ success: false, code: 'MINECRAFT_AUTH_UNAVAILABLE', message: 'Minecraft signing chưa được cấu hình' });
  }
  const path = req.originalUrl.split('?')[0];
  const canonical = minecraftCanonicalRequest({ method: req.method, path, timestamp, nonce, contentSha256: declaredHash, serverId });
  const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('base64url');
  if (!safeEqual(signature, expected)) {
    return res.status(401).json({ success: false, code: 'MINECRAFT_SIGNATURE_INVALID', message: 'Minecraft signature không hợp lệ' });
  }
  pruneNonces(now);
  const replayKey = `${serverId}:${nonce}`;
  if (nonces.has(replayKey)) return res.status(409).json({ success: false, code: 'MINECRAFT_NONCE_REPLAY', message: 'Minecraft request đã được xử lý' });
  nonces.set(replayKey, now + NONCE_TTL_MS);
  req.minecraftService = { serverId };
  // Only a fully verified request reaches this non-secret heartbeat. Persisting
  // before dispatch also prevents setup status from reporting a false positive.
  recordMinecraftServiceSeen(serverId, { db: req.minecraftLevelStatusDb })
    .then(() => next())
    .catch(next);
}
