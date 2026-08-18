import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;
const FORMAT = 'scrypt-v1';

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(String(password), salt, KEY_LENGTH);
  return `${FORMAT}$${salt.toString('base64url')}$${Buffer.from(derivedKey).toString('base64url')}`;
}

export async function verifyPassword(password, storedHash) {
  const [format, saltText, hashText] = String(storedHash || '').split('$');
  if (format !== FORMAT || !saltText || !hashText) return false;

  try {
    const expected = Buffer.from(hashText, 'base64url');
    if (expected.length !== KEY_LENGTH) return false;
    const derivedKey = Buffer.from(await scrypt(String(password), Buffer.from(saltText, 'base64url'), expected.length));
    return expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey);
  } catch {
    return false;
  }
}
