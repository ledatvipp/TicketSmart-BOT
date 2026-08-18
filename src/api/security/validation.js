const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function fieldName(options, fallback = 'Giá trị') {
  if (typeof options === 'string') return options;
  return options?.field || options?.label || fallback;
}

export function cleanString(value, options = {}) {
  const { min = 0, max = 500, trim = true, allowEmpty = true } = options;
  const label = fieldName(options);
  if (value === undefined || value === null) return null;
  let text = String(value).replace(CONTROL_CHARS, '');
  if (trim) text = text.trim();
  if (!allowEmpty && text.length === 0) throw new ValidationError(`${label} không được để trống`);
  if (text.length < min) throw new ValidationError(`${label} phải có ít nhất ${min} ký tự`);
  if (text.length > max) throw new ValidationError(`${label} không được vượt quá ${max} ký tự`);
  return text;
}

export function cleanId(value, options = 'ID') {
  const label = fieldName(options, 'ID');
  const text = cleanString(value, { min: 1, max: options?.max || 128, allowEmpty: false, field: label });
  if (!/^[A-Za-z0-9_:\-.]+$/.test(text)) throw new ValidationError(`${label} không hợp lệ`);
  return text;
}

export function cleanDiscordId(value, options = 'Discord ID') {
  const label = fieldName(options, 'Discord ID');
  const text = cleanString(value, { min: 1, max: 32, allowEmpty: false, field: label });
  if (!/^\d{15,22}$/.test(text) && !['bot', 'system'].includes(text)) throw new ValidationError(`${label} không hợp lệ`);
  return text;
}

export function cleanHttpUrl(value, options = {}) {
  const { allowHttp = false, max = 2048, nullable = true } = options;
  const label = fieldName(options, 'URL');
  if (value === undefined || value === null || value === '') {
    if (nullable) return null;
    throw new ValidationError(`Thiếu ${label}`);
  }
  const text = cleanString(value, { min: 1, max, allowEmpty: false, field: label });
  if (/[\r\n\t]/.test(text)) throw new ValidationError(`${label} chứa ký tự không hợp lệ`);
  let url;
  try { url = new URL(text); } catch { throw new ValidationError(`${label} không hợp lệ`); }
  const allowed = allowHttp ? ['https:', 'http:'] : ['https:'];
  if (!allowed.includes(url.protocol)) throw new ValidationError(`${label} phải dùng ${allowHttp ? 'HTTP/HTTPS' : 'HTTPS'}`);
  if (url.username || url.password) throw new ValidationError(`${label} không được chứa thông tin đăng nhập`);
  return url.toString();
}

// Backwards-compatible explicit protocol-list helper used by hardened controllers.
export function cleanUrl(value, options = {}) {
  const protocols = options.protocols || ['https:'];
  const label = fieldName(options, 'URL');
  if (value === undefined || value === null || value === '') {
    if (options.nullable !== false) return null;
    throw new ValidationError(`Thiếu ${label}`);
  }
  const text = cleanString(value, { min: 1, max: options.max || 2048, allowEmpty: false, field: label });
  if (/[\r\n\t]/.test(text)) throw new ValidationError(`${label} chứa ký tự không hợp lệ`);
  let url;
  try { url = new URL(text); } catch { throw new ValidationError(`${label} không hợp lệ`); }
  if (!protocols.includes(url.protocol)) throw new ValidationError(`${label} phải dùng ${protocols.map((item) => item.replace(':', '')).join('/')}`);
  if (url.username || url.password) throw new ValidationError(`${label} không được chứa thông tin đăng nhập`);
  return url.toString();
}

export function cleanEnum(value, allowed, options = 'Giá trị') {
  const label = fieldName(options);
  const text = cleanString(value, { min: 1, max: 80, allowEmpty: false, field: label });
  if (!allowed.includes(text)) throw new ValidationError(`${label} không hợp lệ`);
  return text;
}

export function cleanBoolean(value, options = false) {
  const objectOptions = typeof options === 'object' && options !== null ? options : {};
  const fallback = typeof options === 'boolean' ? options : (objectOptions.fallback ?? false);
  const label = fieldName(objectOptions);
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  throw new ValidationError(`${label} boolean không hợp lệ`);
}

export function cleanInteger(value, options = {}) {
  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, fallback } = options;
  const label = fieldName(options, 'Giá trị số');
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw new ValidationError(`Thiếu ${label}`);
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ValidationError(`${label} phải nằm trong khoảng ${min}–${max}`);
  }
  return number;
}

export function cleanDate(value, options = 'Ngày') {
  const label = fieldName(options, 'Ngày');
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${label} không hợp lệ`);
  return date;
}

export function cleanStringArray(value, options = {}) {
  const { maxItems = 30, maxLength = 80 } = options;
  const label = fieldName(options, 'Danh sách');
  const items = Array.isArray(value) ? value : String(value || '').split(',');
  const cleaned = [...new Set(items.map((item) => cleanString(item, { max: maxLength, field: label })).filter(Boolean))];
  if (cleaned.length > maxItems) throw new ValidationError(`${label} không được vượt quá ${maxItems} mục`);
  return cleaned;
}

export function parseJsonObject(value, fallback = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object');
    return parsed;
  } catch { throw new ValidationError('JSON object không hợp lệ'); }
}

export function parseJsonArray(value, fallback = []) {
  if (value === undefined || value === null || value === '') return fallback;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) throw new Error('not array');
    return parsed;
  } catch { throw new ValidationError('JSON array không hợp lệ'); }
}

export function safeCsvCell(value) {
  let text = value === undefined || value === null ? '' : String(value);
  text = text.replace(/\r?\n/g, ' ').replace(CONTROL_CHARS, '');
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export class ValidationError extends Error {
  constructor(message, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.statusCode = 400;
  }
}

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
