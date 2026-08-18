const COMMON_REQUIRED = ['DATABASE_URL', 'BOT_API_SECRET'];
const PLACEHOLDER_RE = /^(change[-_ ]?me|secret|password|your[-_]|example|test123|123456)/i;

function requireUrl(name, { https = false, originOnly = false } = {}) {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return;
  let url;
  try { url = new URL(raw); } catch { throw new Error(`${name} phải là URL hợp lệ`); }
  if (https && url.protocol !== 'https:') throw new Error(`${name} bắt buộc dùng HTTPS trong production`);
  if (originOnly && (url.pathname !== '/' || url.search || url.hash || url.username || url.password)) {
    throw new Error(`${name} chỉ được chứa origin, ví dụ https://ticket.example.com`);
  }
}

function requireStrongSecret(name, min = 32) {
  const value = String(process.env[name] || '');
  if (!value) return;
  if (value.length < min) throw new Error(`${name} phải có ít nhất ${min} ký tự`);
  if (PLACEHOLDER_RE.test(value)) throw new Error(`${name} đang dùng giá trị mẫu/không an toàn`);
}

function requireInteger(name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} phải là số nguyên trong khoảng ${min}–${max}`);
  }
}

function requireBoolean(name) {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  if (!raw) return;
  if (!['true', 'false'].includes(raw)) throw new Error(`${name} chỉ nhận true hoặc false`);
}

function requireByteLimit(name, { minBytes = 1, maxBytes = 20 * 1024 * 1024 } = {}) {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return;
  const match = /^(\d+(?:\.\d+)?)(b|kb|mb)?$/i.exec(raw);
  if (!match) throw new Error(`${name} phải có dạng 128kb, 1mb hoặc số byte`);
  const multiplier = { '': 1, b: 1, kb: 1024, mb: 1024 * 1024 }[(match[2] || '').toLowerCase()];
  const bytes = Number(match[1]) * multiplier;
  if (!Number.isFinite(bytes) || bytes < minBytes || bytes > maxBytes) {
    throw new Error(`${name} phải nằm trong khoảng ${minBytes}–${maxBytes} bytes`);
  }
}

function requireDuration(name, { maxSeconds = 86_400 } = {}) {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return;
  const match = /^(\d+)(s|m|h|d)$/i.exec(raw);
  if (!match) throw new Error(`${name} phải có dạng 30s, 15m, 2h hoặc 1d`);
  const multiplier = { s: 1, m: 60, h: 3600, d: 86_400 }[match[2].toLowerCase()];
  const seconds = Number(match[1]) * multiplier;
  if (!Number.isSafeInteger(seconds) || seconds < 60 || seconds > maxSeconds) {
    throw new Error(`${name} phải từ 60 giây đến ${maxSeconds} giây`);
  }
}

function validateWebhookKey() {
  const value = String(process.env.WEBHOOK_ENCRYPTION_KEY || '').trim();
  if (!value) return;
  if (/^[a-f0-9]{64}$/i.test(value)) return;
  try {
    if (Buffer.from(value, 'base64').length === 32) return;
  } catch { /* handled below */ }
  throw new Error('WEBHOOK_ENCRYPTION_KEY phải là 32 bytes base64 hoặc 64 ký tự hex');
}

export function validateEnv(scope = 'common') {
  const required = new Set(COMMON_REQUIRED);
  if (scope === 'bot') {
    required.add('BOT_TOKEN');
    required.add('CLIENT_ID');
    required.add('GUILD_ID');
    // Bot decrypts Dashboard-stored OpenRouter credentials from the shared database.
    if (process.env.NODE_ENV === 'production') required.add('WEBHOOK_ENCRYPTION_KEY');
  }
  if (scope === 'api') {
    required.add('JWT_SECRET');
    required.add('DISCORD_CLIENT_ID');
    required.add('DISCORD_CLIENT_SECRET');
    required.add('DISCORD_REDIRECT_URI');
    required.add('GUILD_ID');
    if (process.env.NODE_ENV === 'production') {
      required.add('PUBLIC_BASE_URL');
      required.add('WEB_ORIGIN');
      required.add('WEBHOOK_ENCRYPTION_KEY');
    }
  }

  const missing = [...required].filter((key) => !String(process.env[key] || '').trim());
  if (missing.length) throw new Error(`Thiếu biến môi trường bắt buộc (${scope}): ${missing.join(', ')}`);

  requireStrongSecret('JWT_SECRET', 32);
  requireStrongSecret('BOT_API_SECRET', 32);
  requireStrongSecret('DISCORD_CLIENT_SECRET', 24);
  if (process.env.JWT_SECRET && process.env.JWT_SECRET === process.env.BOT_API_SECRET) {
    throw new Error('JWT_SECRET và BOT_API_SECRET phải là hai secret khác nhau');
  }
  validateWebhookKey();

  requireInteger('PORT', { min: 1, max: 65535 });
  requireInteger('REFRESH_TOKEN_TTL_DAYS', { min: 1, max: 90 });
  requireInteger('API_RATE_LIMIT', { min: 1, max: 100_000 });
  requireInteger('AUTH_RATE_LIMIT', { min: 1, max: 10_000 });
  requireInteger('EXPENSIVE_RATE_LIMIT', { min: 1, max: 10_000 });
  requireInteger('WEBHOOK_WORKER_INTERVAL_MS', { min: 1000, max: 3_600_000 });
  requireInteger('WEBHOOK_TIMEOUT_MS', { min: 1000, max: 120_000 });
  requireInteger('WEBHOOK_MAX_ATTEMPTS', { min: 1, max: 12 });
  requireInteger('WEBHOOK_MAX_PAYLOAD_BYTES', { min: 16_384, max: 1_048_576 });
  requireInteger('WEBHOOK_BATCH_SIZE', { min: 1, max: 100 });
  requireInteger('WEBHOOK_PROCESSING_TIMEOUT_MS', { min: 30_000, max: 3_600_000 });
  requireInteger('WEBHOOK_RETENTION_DAYS', { min: 1, max: 3650 });
  requireByteLimit('API_JSON_LIMIT', { minBytes: 1024, maxBytes: 10 * 1024 * 1024 });
  requireByteLimit('UPLOAD_JSON_LIMIT', { minBytes: 1024, maxBytes: 20 * 1024 * 1024 });
  requireDuration('ACCESS_TOKEN_TTL', { maxSeconds: 24 * 60 * 60 });
  for (const name of ['COOKIE_SECURE', 'ALLOW_LEGACY_PLAINTEXT_REFRESH', 'ALLOW_LEGACY_BODY_REFRESH', 'ALLOW_INSECURE_BOT_API']) {
    requireBoolean(name);
  }

  if (process.env.NODE_ENV === 'production') {
    if (process.env.COOKIE_SECURE === 'false') throw new Error('COOKIE_SECURE không được false trong production');
    if (process.env.ALLOW_INSECURE_BOT_API === 'true') throw new Error('ALLOW_INSECURE_BOT_API không được bật trong production');
    if (process.env.ALLOW_LEGACY_BODY_REFRESH === 'true') throw new Error('ALLOW_LEGACY_BODY_REFRESH không được bật trong production');
    if (process.env.ALLOW_LEGACY_PLAINTEXT_REFRESH === 'true') throw new Error('ALLOW_LEGACY_PLAINTEXT_REFRESH không được bật trong production');
  }

  if (process.env.OPENROUTER_API_KEY) {
    const key = String(process.env.OPENROUTER_API_KEY).trim();
    if (!key.startsWith('sk-or-') || /\s/.test(key) || key.length < 20 || key.length > 512) {
      throw new Error('OPENROUTER_API_KEY không hợp lệ');
    }
  }
  for (const name of ['OPENROUTER_MODEL', 'OPENROUTER_ANSWER_MODEL', 'OPENROUTER_TRIAGE_MODEL', 'OPENROUTER_EMBEDDING_MODEL']) {
    const value = String(process.env[name] || '').trim();
    if (value && !/^[A-Za-z0-9][A-Za-z0-9._~:@/+\-]{0,199}$/.test(value)) throw new Error(`${name} không phải OpenRouter model slug hợp lệ`);
  }

  if (scope === 'api') {
    const production = process.env.NODE_ENV === 'production';
    requireUrl('DISCORD_REDIRECT_URI', { https: production });
    requireUrl('PUBLIC_BASE_URL', { https: production, originOnly: true });
    requireUrl('OPENROUTER_HTTP_REFERER', { https: production, originOnly: true });
    const origins = String(process.env.WEB_ORIGIN || '').split(',').map((item) => item.trim()).filter(Boolean);
    if (production && (origins.length === 0 || origins.includes('*'))) {
      throw new Error('WEB_ORIGIN production phải là allowlist origin cụ thể, không dùng *');
    }
    for (const [index, origin] of origins.entries()) {
      try {
        const url = new URL(origin);
        if (production && url.protocol !== 'https:') throw new Error('HTTPS required');
        if (!['https:', 'http:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
          throw new Error('origin only');
        }
      } catch {
        throw new Error(`WEB_ORIGIN mục ${index + 1} không phải origin hợp lệ: ${origin}`);
      }
    }
  }
}
