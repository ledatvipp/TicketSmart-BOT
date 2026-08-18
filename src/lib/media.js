import crypto from 'crypto';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { basename, join } from 'path';
import { ValidationError } from '../api/security/validation.js';

const IMAGE_TYPES = Object.freeze({
  png: { mime: 'image/png', ext: 'png' },
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  gif: { mime: 'image/gif', ext: 'gif' },
  webp: { mime: 'image/webp', ext: 'webp' },
});

function detectImageType(buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer.length >= 10 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpeg';
  if (buffer.length >= 10 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'gif';
  if (buffer.length >= 30 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

function jpegDimensions(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > buffer.length) break;
    const size = buffer.readUInt16BE(offset);
    if (size < 2 || offset + size > buffer.length) break;
    const isSof = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
    if (isSof && size >= 7) return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    offset += size;
  }
  return null;
}

function webpDimensions(buffer) {
  const type = buffer.subarray(12, 16).toString('ascii');
  if (type === 'VP8X' && buffer.length >= 30) {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { width, height };
  }
  if (type === 'VP8 ' && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (type === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

function imageDimensions(type, buffer) {
  if (type === 'png') return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (type === 'gif') return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  if (type === 'jpeg') return jpegDimensions(buffer);
  if (type === 'webp') return webpDimensions(buffer);
  return null;
}

export function decodeImageDataUrl(value, {
  maxBytes = 5 * 1024 * 1024,
  maxDimension = 8192,
  maxPixels = 32_000_000,
} = {}) {
  if (typeof value !== 'string') throw new ValidationError('Ảnh phải là data URL base64');
  const match = /^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(value);
  if (!match) throw new ValidationError('Chỉ hỗ trợ ảnh PNG, JPEG, GIF hoặc WebP dạng base64');
  const base64 = match[2].replace(/\s/g, '');
  const estimated = Math.floor((base64.length * 3) / 4);
  if (estimated > maxBytes + 2) throw new ValidationError(`Ảnh không được vượt quá ${Math.floor(maxBytes / 1024 / 1024)} MB`);
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || buffer.length > maxBytes) throw new ValidationError('Kích thước ảnh không hợp lệ');

  const type = detectImageType(buffer);
  if (!type) throw new ValidationError('Nội dung file không phải ảnh hợp lệ');
  const declared = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
  if (declared !== IMAGE_TYPES[type].mime) throw new ValidationError('MIME ảnh không khớp nội dung file');
  const dimensions = imageDimensions(type, buffer);
  if (!dimensions || !dimensions.width || !dimensions.height) throw new ValidationError('Không đọc được kích thước ảnh');
  if (dimensions.width > maxDimension || dimensions.height > maxDimension || dimensions.width * dimensions.height > maxPixels) {
    throw new ValidationError(`Kích thước ảnh vượt giới hạn ${maxDimension}px hoặc ${Math.floor(maxPixels / 1_000_000)} megapixel`);
  }
  return { buffer, type, ...IMAGE_TYPES[type], ...dimensions, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
}

export async function saveImmutableImage({ dataUrl, directory, maxBytes }) {
  const image = decodeImageDataUrl(dataUrl, { maxBytes });
  await mkdir(directory, { recursive: true, mode: 0o750 });
  const fileName = `${image.sha256}.${image.ext}`;
  const path = join(directory, fileName);
  try { await writeFile(path, image.buffer, { flag: 'wx', mode: 0o640 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  return { ...image, fileName, path };
}

export function publicAssetUrl(relativePath, req) {
  const configured = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  let base = configured;
  if (!base && process.env.NODE_ENV !== 'production' && req) base = `${req.protocol}://${req.get('host')}`;
  if (!base) throw new ValidationError('PUBLIC_BASE_URL phải được cấu hình để tạo URL media tuyệt đối');
  const parsed = new URL(base);
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') throw new ValidationError('PUBLIC_BASE_URL production phải dùng HTTPS');
  return `${parsed.toString().replace(/\/+$/, '')}/${String(relativePath).replace(/^\/+/, '')}`;
}

export async function removeImmutableImage(directory, imageUrl) {
  let name = '';
  try { name = basename(new URL(imageUrl).pathname); } catch { name = basename(String(imageUrl || '')); }
  if (!/^[a-f0-9]{64}\.(png|jpg|gif|webp)$/.test(name)) return false;
  try { await unlink(join(directory, name)); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
