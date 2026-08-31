import { prisma } from '../../lib/db.js';
import { emit } from '../../lib/realtime.js';
import { logAudit } from '../../lib/audit.js';
import { parseAllowedOptions } from '../security/policy.js';
import {
  ValidationError,
  cleanBoolean,
  cleanDiscordId,
  cleanId,
  cleanInteger,
  cleanString,
  cleanStringArray,
  parseJsonArray,
} from '../security/validation.js';

const FORM_TYPES = ['text', 'textarea', 'select', 'number', 'url', 'checkbox'];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function cleanColor(value, nullable = true) {
  if (value === undefined) return undefined;
  const text = cleanString(value, { max: 20 });
  if (!text && nullable) return null;
  if (!COLOR_RE.test(text)) throw new ValidationError('Màu phải có dạng #RRGGBB');
  return text.toUpperCase();
}

function cleanCsvDiscordIds(value, { maxItems = 50 } = {}) {
  if (value === undefined) return undefined;
  return cleanStringArray(value, { maxItems, maxLength: 32 }).map((item) => {
    const match = /^<@&?(\d{15,22})>$/.exec(item);
    return cleanDiscordId(match?.[1] || item);
  }).join(',');
}

function normalizeFormFields(value) {
  if (value === undefined) return undefined;
  const fields = parseJsonArray(value, []);
  if (fields.length > 10) throw new ValidationError('Form không được vượt quá 10 trường');
  const seen = new Set();
  const normalized = fields.map((field, index) => {
    if (!field || typeof field !== 'object' || Array.isArray(field)) throw new ValidationError(`Form field #${index + 1} không hợp lệ`);
    const id = cleanId(field.id || `field_${index + 1}`, 'Form field ID');
    if (seen.has(id)) throw new ValidationError(`Trùng form field ID: ${id}`);
    seen.add(id);
    const type = FORM_TYPES.includes(field.type) ? field.type : 'text';
    const options = type === 'select' ? cleanStringArray(field.options, { maxItems: 25, maxLength: 100 }) : [];
    if (type === 'select' && options.length < 2) throw new ValidationError(`Select ${id} cần ít nhất 2 lựa chọn`);
    return {
      id,
      label: cleanString(field.label, { min: 1, max: 100, allowEmpty: false }),
      type,
      required: cleanBoolean(field.required, false),
      placeholder: cleanString(field.placeholder, { max: 200 }) || '',
      ...(options.length ? { options } : {}),
    };
  });
  const serialized = JSON.stringify(normalized);
  if (Buffer.byteLength(serialized) > 32 * 1024) throw new ValidationError('Form fields quá lớn');
  return serialized;
}

function normalizeAutoMessages(value) {
  if (value === undefined) return undefined;
  const messages = parseJsonArray(value, []);
  if (messages.length > 20) throw new ValidationError('Không được vượt quá 20 auto message');
  return JSON.stringify(messages.map((item) => cleanString(item, { min: 1, max: 1800, trim: false, allowEmpty: false })));
}

async function normalizeClusterKeys(value) {
  if (value === undefined) return undefined;
  const keys = cleanStringArray(value, { maxItems: 30, maxLength: 40 }).map((key) => key.toLowerCase());
  if (!keys.length || keys.includes('*')) return '*';
  for (const key of keys) if (!/^[a-z0-9-]{2,40}$/.test(key)) throw new ValidationError(`Cluster key không hợp lệ: ${key}`);
  const count = await prisma.cluster.count({ where: { key: { in: keys } } });
  if (count !== keys.length) throw new ValidationError('clusterKeys chứa cluster không tồn tại');
  return [...new Set(keys)].join(',');
}

async function normalizeOptionData(body, { creating = false, currentId = null } = {}) {
  const data = {};
  const textFields = {
    name: [1, 100, false], emoji: [0, 20, true], description: [0, 300, true], welcomeMessage: [0, 4000, true],
    ticketTitle: [0, 256, true], ticketDesc: [0, 4000, true], ticketGuidance: [0, 2000, true], ticketFooter: [0, 512, true],
  };
  for (const [key, [min, max, nullable]] of Object.entries(textFields)) {
    if (body[key] !== undefined) {
      const value = cleanString(body[key], { min, max, trim: key !== 'welcomeMessage' && key !== 'ticketDesc', allowEmpty: nullable });
      data[key] = value || (nullable ? null : value);
    }
  }
  if (creating && !data.name) throw new ValidationError('Thiếu tên option');
  for (const key of ['color', 'ticketColor']) {
    const value = cleanColor(body[key]); if (value !== undefined) data[key] = value;
  }
  if (body.discordCategoryId !== undefined) data.discordCategoryId = body.discordCategoryId ? cleanDiscordId(body.discordCategoryId, 'Category ID') : null;
  if (body.inheritFormFromId !== undefined) {
    const value = body.inheritFormFromId ? cleanId(body.inheritFormFromId, 'Option kế thừa') : null;
    if (value && value === currentId) throw new ValidationError('Option không thể kế thừa chính nó');
    if (value && !(await prisma.option.findUnique({ where: { id: value }, select: { id: true } }))) throw new ValidationError('Option kế thừa không tồn tại');
    data.inheritFormFromId = value;
  }
  for (const key of ['isActive', 'customEmbedEnabled']) if (body[key] !== undefined) data[key] = cleanBoolean(body[key]);
  const integerFields = {
    sortOrder: [-100000, 100000], autoCloseHours: [0, 8760], autoEscalateMinutes: [0, 43200],
    slaResponseMinutes: [0, 43200], maxOpenPerUser: [0, 2],
  };
  for (const [key, [min, max]] of Object.entries(integerFields)) {
    if (body[key] !== undefined) data[key] = body[key] === null ? null : cleanInteger(body[key], { min, max });
  }
  const formFields = normalizeFormFields(body.formFields); if (formFields !== undefined) data.formFields = formFields;
  const autoMessages = normalizeAutoMessages(body.autoMessages); if (autoMessages !== undefined) data.autoMessages = autoMessages;
  const clusterKeys = await normalizeClusterKeys(body.clusterKeys); if (clusterKeys !== undefined) data.clusterKeys = clusterKeys;
  const allowedStaffRoles = cleanCsvDiscordIds(body.allowedStaffRoles); if (allowedStaffRoles !== undefined) data.allowedStaffRoles = allowedStaffRoles;
  const pingStaff = cleanCsvDiscordIds(body.pingStaff); if (pingStaff !== undefined) data.pingStaff = pingStaff;
  return data;
}

function optionScope(req) {
  if (req.authKind === 'bot' || req.user?.allOptions) return {};
  const allowed = parseAllowedOptions(req.user?.allowedOptions);
  return allowed === null ? {} : { id: { in: allowed } };
}

export async function getOptions(req, res, next) {
  try {
    const clauses = [optionScope(req)];
    if (req.query.active === 'true') clauses.push({ isActive: true });
    const clusterKey = cleanString(req.query.clusterKey, { max: 40 })?.toLowerCase();
    if (clusterKey) {
      if (!/^[a-z0-9-]{2,40}$/.test(clusterKey)) throw new ValidationError('clusterKey không hợp lệ');
      clauses.push({ OR: [
        { clusterKeys: '*' }, { clusterKeys: clusterKey }, { clusterKeys: { startsWith: `${clusterKey},` } },
        { clusterKeys: { endsWith: `,${clusterKey}` } }, { clusterKeys: { contains: `,${clusterKey},` } },
      ] });
    }
    const where = clauses.filter((item) => Object.keys(item).length).length ? { AND: clauses.filter((item) => Object.keys(item).length) } : {};
    const options = await prisma.option.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { _count: { select: { tickets: true } } } });
    res.json({ success: true, data: options });
  } catch (error) { next(error); }
}

export async function getOptionById(req, res, next) {
  try {
    const id = cleanId(req.params.id, 'Option ID');
    const option = await prisma.option.findFirst({ where: { AND: [{ id }, optionScope(req)] }, include: { _count: { select: { tickets: true } } } });
    if (!option) return res.status(404).json({ success: false, message: 'Không tìm thấy option' });
    res.json({ success: true, data: option });
  } catch (error) { next(error); }
}

export async function createOption(req, res, next) {
  try {
    const first = await prisma.option.findFirst({ orderBy: { sortOrder: 'asc' }, select: { sortOrder: true } });
    const data = await normalizeOptionData(req.body || {}, { creating: true });
    const option = await prisma.option.create({ data: { emoji: '🗺️', color: '#5865F2', autoMessages: '[]', isActive: true, clusterKeys: '*', ...data, sortOrder: data.sortOrder ?? ((first?.sortOrder ?? 0) - 1) } });
    await logAudit({ action: 'option.create', actorId: req.user.discordId, actorName: req.user.username, metadata: { optionId: option.id, name: option.name } });
    emit('option:created', option);
    res.status(201).json({ success: true, data: option });
  } catch (error) { next(error); }
}

export async function updateOption(req, res, next) {
  try {
    const id = cleanId(req.params.id, 'Option ID');
    if (!(await prisma.option.findUnique({ where: { id }, select: { id: true } }))) return res.status(404).json({ success: false, message: 'Không tìm thấy option' });
    const data = await normalizeOptionData(req.body || {}, { currentId: id });
    if (!Object.keys(data).length) throw new ValidationError('Không có thay đổi nào');
    const option = await prisma.option.update({ where: { id }, data });
    await logAudit({ action: 'option.update', actorId: req.user.discordId, actorName: req.user.username, metadata: { optionId: option.id, fields: Object.keys(data) } });
    emit('option:updated', option);
    res.json({ success: true, data: option });
  } catch (error) { next(error); }
}

export async function deleteOption(req, res, next) {
  try {
    const id = cleanId(req.params.id, 'Option ID');
    const existing = await prisma.option.findUnique({ where: { id }, include: { _count: { select: { tickets: true } } } });
    if (!existing) return res.status(404).json({ success: false, message: 'Không tìm thấy option' });
    if (existing._count.tickets > 0) return res.status(409).json({ success: false, message: 'Option đã có ticket; hãy tắt option thay vì xóa', code: 'OPTION_IN_USE' });
    const defaultClusterCount = await prisma.cluster.count({ where: { defaultOptionId: id } });
    if (defaultClusterCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Option đang là loại mặc định của ${defaultClusterCount} cụm; hãy đổi cấu hình cụm trước khi xóa`,
        code: 'OPTION_IN_CLUSTER_DEFAULT',
      });
    }
    const scopedStaff = await prisma.staff.findMany({
      where: { allowedOptions: { contains: id } },
      select: { discordId: true, allowedOptions: true },
    });
    const exactReferences = scopedStaff.filter((staff) => parseAllowedOptions(staff.allowedOptions)?.includes(id));
    if (exactReferences.length) {
      return res.status(409).json({
        success: false,
        message: `Option đang nằm trong phạm vi truy cập của ${exactReferences.length} staff; hãy cập nhật quyền staff trước khi xóa`,
        code: 'OPTION_IN_STAFF_SCOPE',
      });
    }
    await prisma.option.delete({ where: { id } });
    await logAudit({ action: 'option.delete', actorId: req.user.discordId, actorName: req.user.username, metadata: { optionId: existing.id, name: existing.name } });
    emit('option:deleted', { id: existing.id });
    res.json({ success: true, message: 'Đã xóa option' });
  } catch (error) { next(error); }
}

export async function toggleOption(req, res, next) {
  try {
    const id = cleanId(req.params.id, 'Option ID');
    const existing = await prisma.option.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Không tìm thấy option' });
    const option = await prisma.option.update({ where: { id }, data: { isActive: !existing.isActive } });
    await logAudit({ action: 'option.toggle', actorId: req.user.discordId, actorName: req.user.username, metadata: { optionId: option.id, isActive: option.isActive } });
    emit('option:updated', option);
    res.json({ success: true, data: option });
  } catch (error) { next(error); }
}
