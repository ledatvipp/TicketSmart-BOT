import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../../lib/db.js';
import { logAudit } from '../../lib/audit.js';
import { publicAssetUrl, removeImmutableImage, saveImmutableImage } from '../../lib/media.js';
import { ValidationError, cleanId, cleanString, parseJsonObject } from '../security/validation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '../../../uploads/banners');
const PUBLIC_PATH = 'uploads/banners';
const MAX_CONFIG_BYTES = 64 * 1024;

function normalizeConfig(config) {
  const value = parseJsonObject(config, {});
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_CONFIG_BYTES) throw new ValidationError('Config banner không được vượt quá 64 KB');
  // Không lưu media base64 vào SQLite.
  if (/data:[^;]+;base64,/i.test(serialized)) throw new ValidationError('Config banner không được chứa data URL; media phải lưu thành file riêng');
  return serialized;
}

export async function listBanners(_req, res, next) {
  try {
    const items = await prisma.generatedBanner.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
    res.json({ success: true, data: items });
  } catch (error) { next(error); }
}

export async function createBanner(req, res, next) {
  let saved;
  try {
    const name = cleanString(req.body?.name, { min: 1, max: 120, allowEmpty: false });
    const config = normalizeConfig(req.body?.config);
    saved = await saveImmutableImage({ dataUrl: req.body?.image, directory: UPLOADS_DIR, maxBytes: 5 * 1024 * 1024 });
    const imageUrl = publicAssetUrl(`${PUBLIC_PATH}/${saved.fileName}`, req);
    const item = await prisma.generatedBanner.create({ data: { name, imageUrl, config } });
    await logAudit({ action: 'banner.create', actorId: req.user.discordId, actorName: req.user.username, metadata: { id: item.id, name: item.name, sha256: saved.sha256, width: saved.width, height: saved.height } });
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    // File content-addressed có thể đang được banner khác dùng; không xóa khi DB create fail.
    next(error);
  }
}

export async function deleteBanner(req, res, next) {
  try {
    const id = cleanId(req.params.id, 'Banner ID');
    const item = await prisma.generatedBanner.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ success: false, message: 'Không tìm thấy banner' });
    await prisma.generatedBanner.delete({ where: { id } });
    const stillUsed = await prisma.generatedBanner.count({ where: { imageUrl: item.imageUrl } });
    if (!stillUsed) await removeImmutableImage(UPLOADS_DIR, item.imageUrl).catch((error) => console.warn('[BANNER DELETE FILE]', error.message));
    await logAudit({ action: 'banner.delete', actorId: req.user.discordId, actorName: req.user.username, metadata: { id: item.id, name: item.name } });
    res.json({ success: true });
  } catch (error) { next(error); }
}
