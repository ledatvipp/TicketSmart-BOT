const REFRESH_COOKIE_DEV = 'is7_refresh';
const REFRESH_COOKIE_PROD = '__Host-is7_refresh';
const STATE_COOKIE_DEV = 'is7_oauth_state';
const STATE_COOKIE_PROD = '__Host-is7_oauth_state';

function isSecureCookie() {
  if (process.env.COOKIE_SECURE !== undefined) return process.env.COOKIE_SECURE === 'true';
  return process.env.NODE_ENV === 'production';
}

function cookieName(devName, prodName) {
  return isSecureCookie() ? prodName : devName;
}

export function refreshCookieName() {
  return cookieName(REFRESH_COOKIE_DEV, REFRESH_COOKIE_PROD);
}

export function oauthStateCookieName() {
  return cookieName(STATE_COOKIE_DEV, STATE_COOKIE_PROD);
}

export function parseCookies(header = '') {
  const result = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(raw); } catch { result[key] = raw; }
  }
  return result;
}

function serializeCookie(name, value, { maxAge, sameSite = 'Lax', httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (isSecureCookie()) parts.push('Secure');
  if (Number.isFinite(maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  return parts.join('; ');
}

function appendCookie(res, cookie) {
  const current = res.getHeader('Set-Cookie');
  if (!current) res.setHeader('Set-Cookie', cookie);
  else if (Array.isArray(current)) res.setHeader('Set-Cookie', [...current, cookie]);
  else res.setHeader('Set-Cookie', [current, cookie]);
}

export function setRefreshCookie(res, token, maxAgeSeconds = 30 * 24 * 60 * 60) {
  appendCookie(res, serializeCookie(refreshCookieName(), token, { maxAge: maxAgeSeconds, sameSite: 'Lax' }));
}

export function clearRefreshCookie(res) {
  appendCookie(res, serializeCookie(refreshCookieName(), '', { maxAge: 0, sameSite: 'Lax' }));
}

export function getRefreshCookie(req) {
  return parseCookies(req.headers.cookie)[refreshCookieName()] || null;
}

export function setOAuthStateCookie(res, state, maxAgeSeconds = 10 * 60) {
  appendCookie(res, serializeCookie(oauthStateCookieName(), state, { maxAge: maxAgeSeconds, sameSite: 'Lax' }));
}

export function clearOAuthStateCookie(res) {
  appendCookie(res, serializeCookie(oauthStateCookieName(), '', { maxAge: 0, sameSite: 'Lax' }));
}

export function getOAuthStateCookie(req) {
  return parseCookies(req.headers.cookie)[oauthStateCookieName()] || null;
}
