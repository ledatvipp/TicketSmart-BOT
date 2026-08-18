import crypto from 'crypto';

const CSP_BASE = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://discord.com",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "media-src 'self' https: blob:",
].join('; ');

function contentSecurityPolicy() {
  return process.env.NODE_ENV === 'production'
    ? `${CSP_BASE}; upgrade-insecure-requests`
    : CSP_BASE;
}

export function requestContext(req, res, next) {
  const incoming = String(req.headers['x-request-id'] || '').trim();
  req.requestId = /^[A-Za-z0-9._:-]{8,128}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

export function securityHeaders(_req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next();

  res.setHeader('Content-Security-Policy', contentSecurityPolicy());
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

export function createOriginGuard(allowedOrigins) {
  const allowed = new Set(allowedOrigins.filter((value) => value !== '*'));
  return (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    // Bot/server-to-server không gửi Origin. Browser request có Origin phải đúng allowlist.
    const origin = req.headers.origin;
    if (!origin) return next();
    if (allowedOrigins.includes('*') || allowed.has(origin)) return next();
    return res.status(403).json({ success: false, message: 'Origin không được phép', code: 'ORIGIN_FORBIDDEN' });
  };
}

export function configureTrustProxy(app) {
  const raw = String(process.env.TRUST_PROXY || '').trim();
  if (!raw || raw === '0' || raw.toLowerCase() === 'false') return;
  if (/^\d+$/.test(raw)) app.set('trust proxy', Number(raw));
  else app.set('trust proxy', raw.split(',').map((item) => item.trim()).filter(Boolean));
}

export function apiErrorHandler(err, req, res, _next) {
  const status = Number(err?.statusCode || err?.status || (err?.type === 'entity.too.large' ? 413 : 500));
  const isClientError = status >= 400 && status < 500;
  if (!isClientError) {
    console.error(`[ERROR ${req.requestId || '-'}]`, err);
  }
  const message = status === 413
    ? 'Dữ liệu gửi lên quá lớn'
    : (isClientError ? (err.message || 'Request không hợp lệ') : 'Lỗi server nội bộ');
  res.status(status).json({
    success: false,
    message,
    code: err?.code || (status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR'),
    requestId: req.requestId,
  });
}
