import crypto from 'crypto';

const PREFIX = 'enc:v1:';

function keyMaterial() {
  const configured = String(process.env.WEBHOOK_ENCRYPTION_KEY || '').trim();
  if (configured) {
    if (/^[a-f0-9]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
    try {
      const decoded = Buffer.from(configured, 'base64');
      if (decoded.length === 32) return decoded;
    } catch { /* handled below */ }
    throw new Error('WEBHOOK_ENCRYPTION_KEY phải là 32 bytes dạng base64 hoặc 64 ký tự hex');
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Thiếu WEBHOOK_ENCRYPTION_KEY trong production');
  const fallback = String(process.env.JWT_SECRET || 'development-only-insecure-key');
  return crypto.createHash('sha256').update(`webhook-secret:${fallback}`).digest();
}

export function encryptSecret(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyMaterial(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, tag, encrypted]).toString('base64url')}`;
}

export function decryptSecret(value) {
  if (!value) return null;
  const text = String(value);
  // Legacy plaintext: chỉ đọc để không làm hỏng DB cũ; update/rotate sẽ mã hóa lại.
  if (!text.startsWith(PREFIX)) return text;
  const encoded = text.slice(PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('Secret ciphertext không hợp lệ');
  const packed = Buffer.from(encoded, 'base64url');
  if (packed.length < 29 || packed.toString('base64url') !== encoded) {
    throw new Error('Secret ciphertext không hợp lệ');
  }
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyMaterial(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function maskSecret(value) {
  return value ? '••••••••••••' : '';
}
