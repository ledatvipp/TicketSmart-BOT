import crypto from 'crypto';
import { prisma } from '../../lib/db.js';
import {
  generateAccessToken,
  generateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  refreshCookieMaxAgeSeconds,
} from '../middleware/auth.js';
import {
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshCookie,
  setOAuthStateCookie,
  clearOAuthStateCookie,
  getOAuthStateCookie,
} from '../security/cookies.js';
import { safeStaff } from '../security/policy.js';
import { cleanString } from '../security/validation.js';
import { verifyPassword } from '../security/passwords.js';
import { logAudit } from '../../lib/audit.js';

function timingSafeTextEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'error' });
  } finally {
    clearTimeout(timer);
  }
}

export const getLoginConfig = (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI || '';
  const state = crypto.randomBytes(32).toString('base64url');
  setOAuthStateCookie(res, state);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify',
    state,
  });
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    success: true,
    loginUrl: `https://discord.com/oauth2/authorize?${params}`,
    localLoginEnabled: process.env.LOCAL_LOGIN_ENABLED === 'true',
  });
};

/** POST /api/auth/discord — body { code, state }. */
export const discordCallback = async (req, res) => {
  try {
    const code = cleanString(req.body?.code, { min: 8, max: 512, allowEmpty: false });
    const state = cleanString(req.body?.state, { min: 16, max: 256, allowEmpty: false });
    const cookieState = getOAuthStateCookie(req);
    clearOAuthStateCookie(res);
    if (!timingSafeTextEqual(state, cookieState)) {
      return res.status(400).json({ success: false, message: 'OAuth state không hợp lệ hoặc đã hết hạn', code: 'OAUTH_STATE_INVALID' });
    }

    const tokenResp = await fetchWithTimeout('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
      }),
    });

    if (!tokenResp.ok) {
      console.warn(`[DISCORD TOKEN] OAuth exchange failed with status ${tokenResp.status}`);
      return res.status(400).json({ success: false, message: 'Code OAuth không hợp lệ', code: 'OAUTH_CODE_INVALID' });
    }
    const tokenData = await tokenResp.json();

    const userResp = await fetchWithTimeout('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userResp.ok) return res.status(400).json({ success: false, message: 'Không lấy được user Discord' });
    const discordUser = await userResp.json();

    const staff = await prisma.staff.findUnique({ where: { discordId: String(discordUser.id) } });
    if (!staff) return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập' });

    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;
    const updatedStaff = await prisma.staff.update({
      where: { discordId: String(discordUser.id) },
      data: {
        username: cleanString(discordUser.username, { min: 1, max: 100, allowEmpty: false }),
        avatar: avatarUrl,
      },
    });

    const accessToken = generateAccessToken({ discordId: updatedStaff.discordId });
    const refreshToken = await generateRefreshToken(updatedStaff.discordId);
    setRefreshCookie(res, refreshToken, refreshCookieMaxAgeSeconds());

    await logAudit({
      action: 'auth.login',
      actorId: updatedStaff.discordId,
      actorName: updatedStaff.username,
      metadata: { requestId: req.requestId },
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: { token: accessToken, user: safeStaff(updatedStaff) } });
  } catch (err) {
    if (err?.statusCode === 400) return res.status(400).json({ success: false, message: err.message, code: err.code });
    console.error('[AUTH DISCORD ERROR]', err?.name === 'AbortError' ? 'Discord request timeout' : err);
    res.status(500).json({ success: false, message: 'Lỗi xác thực', requestId: req.requestId });
  }
};

/** POST /api/auth/local — body { username, password }. Local accounts are opt-in. */
export const localLogin = async (req, res) => {
  if (process.env.LOCAL_LOGIN_ENABLED !== 'true') {
    return res.status(404).json({ success: false, message: 'Phương thức đăng nhập này chưa được bật' });
  }

  try {
    const username = cleanString(req.body?.username, { min: 2, max: 50, allowEmpty: false, field: 'Tên đăng nhập' });
    const password = cleanString(req.body?.password, { min: 8, max: 256, trim: false, allowEmpty: false, field: 'Mật khẩu' });
    if (!/^[A-Za-z0-9_.-]+$/.test(username)) {
      return res.status(400).json({ success: false, message: 'Tên đăng nhập không hợp lệ', code: 'LOCAL_USERNAME_INVALID' });
    }

    const account = await prisma.localAccount.findUnique({ where: { username }, include: { staff: true } });
    const passwordValid = account && await verifyPassword(password, account.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không đúng', code: 'LOCAL_LOGIN_INVALID' });
    }

    const accessToken = generateAccessToken({ discordId: account.staff.discordId });
    const refreshToken = await generateRefreshToken(account.staff.discordId);
    setRefreshCookie(res, refreshToken, refreshCookieMaxAgeSeconds());
    await logAudit({
      action: 'auth.local_login',
      actorId: account.staff.discordId,
      actorName: account.staff.username,
      metadata: { requestId: req.requestId },
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: { token: accessToken, user: safeStaff(account.staff) } });
  } catch (err) {
    if (err?.statusCode === 400) return res.status(400).json({ success: false, message: err.message, code: err.code });
    console.error('[AUTH LOCAL ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi xác thực', requestId: req.requestId });
  }
};

/** POST /api/auth/refresh — refresh token lấy từ cookie HttpOnly. */
export const refresh = async (req, res) => {
  try {
    const rawToken = getRefreshCookie(req)
      || (process.env.ALLOW_LEGACY_BODY_REFRESH === 'true' ? req.body?.refreshToken : null);
    if (!rawToken) {
      clearRefreshCookie(res);
      return res.status(401).json({ success: false, message: 'Không có refresh session', code: 'REFRESH_MISSING' });
    }

    const rotation = await rotateRefreshToken(rawToken);
    if (rotation.status !== 'ok') {
      clearRefreshCookie(res);
      return res.status(401).json({
        success: false,
        message: rotation.status === 'reused' ? 'Phát hiện refresh token bị sử dụng lại; mọi phiên đã bị thu hồi' : 'Refresh session không hợp lệ',
        code: rotation.status === 'reused' ? 'REFRESH_REUSED' : 'REFRESH_INVALID',
      });
    }

    const staff = await prisma.staff.findUnique({ where: { discordId: rotation.discordId } });
    if (!staff) {
      await revokeAllRefreshTokens(rotation.discordId);
      clearRefreshCookie(res);
      return res.status(403).json({ success: false, message: 'Quyền truy cập đã bị thu hồi' });
    }

    setRefreshCookie(res, rotation.refreshToken, refreshCookieMaxAgeSeconds());
    const accessToken = generateAccessToken({ discordId: staff.discordId });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: { token: accessToken, user: safeStaff(staff) } });
  } catch (err) {
    console.error('[REFRESH ERROR]', err);
    clearRefreshCookie(res);
    res.status(500).json({ success: false, message: 'Lỗi refresh', requestId: req.requestId });
  }
};

export const logout = async (req, res) => {
  try {
    const rawToken = getRefreshCookie(req)
      || (process.env.ALLOW_LEGACY_BODY_REFRESH === 'true' ? req.body?.refreshToken : null);
    if (rawToken) await revokeRefreshToken(rawToken);
    clearRefreshCookie(res);
    res.json({ success: true });
  } catch {
    clearRefreshCookie(res);
    res.status(500).json({ success: false, message: 'Lỗi logout' });
  }
};

export const logoutAll = async (req, res) => {
  await revokeAllRefreshTokens(req.user.discordId);
  clearRefreshCookie(res);
  await logAudit({ action: 'auth.logout_all', actorId: req.user.discordId, actorName: req.user.username });
  res.json({ success: true });
};

export const getMe = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: req.user });
};
