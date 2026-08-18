import crypto from 'crypto';
import { cleanBoolean, cleanDiscordId, cleanString } from '../security/validation.js';

export function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

export function isValidBotRequest(req) {
  const secret = process.env.BOT_API_SECRET;
  return Boolean(secret && safeEqual(req.headers['x-bot-secret'], secret));
}

export function botIdentity() {
  return {
    discordId: 'bot',
    username: 'Discord Bot',
    role: 'BOT',
    permissions: { '*': true },
    allowedOptions: [],
    allOptions: true,
    authKind: 'bot',
    claimedAdmin: false,
  };
}

/** X-Bot-Actor is trusted only after BOT_API_SECRET has been verified. */
export function parseBotActor(req) {
  const fallback = botIdentity();
  const raw = req.headers['x-bot-actor'];
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(String(raw));
    return {
      ...fallback,
      discordId: cleanDiscordId(parsed?.discordId, 'Bot actor ID'),
      username: cleanString(parsed?.username, { min: 1, max: 100, allowEmpty: false }),
      claimedAdmin: cleanBoolean(parsed?.isAdmin, false),
    };
  } catch {
    return fallback;
  }
}

// Chỉ fail-open trong development khi opt-in rõ ràng.
export function requireBotSecret(req, res, next) {
  const secret = process.env.BOT_API_SECRET;
  const allowInsecureDev = process.env.NODE_ENV === 'development' && process.env.ALLOW_INSECURE_BOT_API === 'true';

  if (!secret) {
    if (allowInsecureDev) {
      if (!globalThis.__warnedBotSecret) {
        console.warn('⚠️ BOT_API_SECRET chưa set; internal API đang mở vì ALLOW_INSECURE_BOT_API=true.');
        globalThis.__warnedBotSecret = true;
      }
      req.authKind = 'bot';
      req.user = parseBotActor(req);
      return next();
    }
    return res.status(503).json({ success: false, message: 'Internal API chưa được cấu hình an toàn' });
  }

  if (!isValidBotRequest(req)) {
    return res.status(401).json({ success: false, message: 'Bot secret không hợp lệ' });
  }
  req.authKind = 'bot';
  req.user = parseBotActor(req);
  next();
}
