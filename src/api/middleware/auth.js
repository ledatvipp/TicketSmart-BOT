// Discord OAuth2 + JWT access token + rotating HttpOnly refresh session.
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../../lib/db.js';
import { safeStaff, hasPermission } from '../security/policy.js';

const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TTL_DAYS = Math.min(90, Math.max(1, Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30)));
const JWT_ISSUER = process.env.JWT_ISSUER || 'discord-smart-ticket-system';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'ticket-dashboard';
const JWT_ALGORITHM = 'HS256';

function jwtOptions() {
  return {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, jwtOptions());
}

export async function authenticateAccessToken(token) {
  const decoded = verifyAccessToken(token);
  const discordId = String(decoded.sub || decoded.discordId || '');
  if (!discordId) throw new jwt.JsonWebTokenError('Missing subject');
  const staff = await prisma.staff.findUnique({ where: { discordId } });
  if (!staff) {
    const error = new Error('Staff access revoked');
    error.code = 'STAFF_REVOKED';
    throw error;
  }
  return { ...safeStaff(staff), authKind: 'user' };
}

/** Middleware yêu cầu access token từ Authorization: Bearer. */
export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Không có access token', code: 'TOKEN_MISSING' });
    }
    req.user = await authenticateAccessToken(authHeader.slice(7));
    req.authKind = 'user';
    next();
  } catch (err) {
    if (err?.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token hết hạn', code: 'TOKEN_EXPIRED' });
    }
    if (err?.name === 'JsonWebTokenError' || err?.code === 'STAFF_REVOKED') {
      return res.status(401).json({ success: false, message: 'Token không hợp lệ', code: 'TOKEN_INVALID' });
    }
    console.error('[AUTH ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi xác thực', requestId: req.requestId });
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Chưa xác thực' });
  if (req.authKind === 'bot' || hasPermission(req.user, '*') || req.user.role === 'ADMIN') return next();
  return res.status(403).json({ success: false, message: 'Yêu cầu quyền ADMIN', code: 'FORBIDDEN' });
};

/** Access token ngắn hạn; không chứa dữ liệu quyền có thể trở nên stale ngoài subject. */
export const generateAccessToken = (payload) => {
  const discordId = String(payload?.discordId || payload?.sub || '');
  if (!discordId) throw new Error('Không thể tạo access token thiếu discordId');
  return jwt.sign(
    { discordId, jti: crypto.randomUUID() },
    process.env.JWT_SECRET,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: ACCESS_TTL,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      subject: discordId,
    },
  );
};

export const hashRefreshToken = (token) => (
  crypto.createHash('sha256').update(String(token)).digest('hex')
);

function makeRawRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

function refreshExpiresAt() {
  return new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function refreshCookieMaxAgeSeconds() {
  return REFRESH_TTL_DAYS * 24 * 60 * 60;
}

/** DB chỉ lưu SHA-256; raw token chỉ đi vào cookie HttpOnly. */
export const generateRefreshToken = async (discordId, db = prisma) => {
  const rawToken = makeRawRefreshToken();
  await db.refreshToken.create({
    data: { token: hashRefreshToken(rawToken), discordId, expiresAt: refreshExpiresAt() },
  });
  return rawToken;
};

async function findRefreshRecord(rawToken, db = prisma) {
  if (!rawToken) return null;
  const hashed = hashRefreshToken(rawToken);
  let record = await db.refreshToken.findUnique({ where: { token: hashed } });
  // Tương thích một lần với token plaintext của phiên bản cũ; token đó sẽ bị rotate/revoke ngay.
  if (!record && process.env.ALLOW_LEGACY_PLAINTEXT_REFRESH === 'true') {
    record = await db.refreshToken.findUnique({ where: { token: String(rawToken) } });
  }
  return record;
}

/**
 * Rotation nguyên tử. updateMany có điều kiện đảm bảo hai request song song không thể
 * cùng consume một refresh token. Reuse token đã revoke sẽ revoke toàn bộ phiên user.
 */
export async function rotateRefreshToken(rawToken) {
  if (!rawToken) return { status: 'invalid' };
  return prisma.$transaction(async (tx) => {
    const record = await findRefreshRecord(rawToken, tx);
    if (!record) return { status: 'invalid' };

    const now = new Date();
    if (record.revokedAt) {
      await tx.refreshToken.updateMany({
        where: { discordId: record.discordId, revokedAt: null },
        data: { revokedAt: now },
      });
      return { status: 'reused', discordId: record.discordId };
    }
    if (record.expiresAt <= now) {
      await tx.refreshToken.updateMany({
        where: { id: record.id, revokedAt: null },
        data: { revokedAt: now },
      });
      return { status: 'expired', discordId: record.discordId };
    }

    const consumed = await tx.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    if (consumed.count !== 1) {
      await tx.refreshToken.updateMany({
        where: { discordId: record.discordId, revokedAt: null },
        data: { revokedAt: now },
      });
      return { status: 'reused', discordId: record.discordId };
    }

    const nextRawToken = makeRawRefreshToken();
    await tx.refreshToken.create({
      data: {
        token: hashRefreshToken(nextRawToken),
        discordId: record.discordId,
        expiresAt: refreshExpiresAt(),
      },
    });
    return { status: 'ok', discordId: record.discordId, refreshToken: nextRawToken };
  });
}

/** Dùng cho kiểm tra tương thích; refresh endpoint nên dùng rotateRefreshToken. */
export const verifyRefreshToken = async (rawToken) => {
  const record = await findRefreshRecord(rawToken);
  if (!record || record.revokedAt || record.expiresAt <= new Date()) return null;
  return record;
};

export const revokeRefreshToken = async (rawToken) => {
  const record = await findRefreshRecord(rawToken);
  if (!record || record.revokedAt) return false;
  const result = await prisma.refreshToken.updateMany({
    where: { id: record.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count === 1;
};

export const revokeAllRefreshTokens = async (discordId) => {
  await prisma.refreshToken.updateMany({
    where: { discordId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

export const generateToken = generateAccessToken;
