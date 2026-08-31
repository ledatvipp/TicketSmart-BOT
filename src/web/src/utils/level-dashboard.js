export const DEFAULT_LEVEL_CONFIG = Object.freeze({
  version: 1,
  enabled: false,
  requiredVerifiedRoleIds: ['1543196526946291783'],
  allowedChannelIds: [],
  xpPerMessage: 20,
  minContentLength: 10,
  cooldownSeconds: 60,
  similarityWindow: 10,
  similarityThreshold: 0.7,
  profanityTerms: ['đm', 'dmm', 'dcm', 'vcl', 'clm', 'fuck', 'shit', 'bitch'],
  profanityXpMultiplier: 0.5,
  levelRoles: [],
  rewardSpins: 1,
  rewardMilestones: [],
  minecraftServiceId: 'default',
  maxRewardAttempts: 12,
  rewardRetryBaseSeconds: 60,
  announcementEnabled: true,
  announcementChannelId: null,
  adminRoleIds: [],
  imageEnabled: true,
  accentColor: '#5865F2',
});

const DISCORD_ID = /^\d{15,22}$/;
const SENSITIVE_KEY = /(?:token|secret|password|api[_-]?key|credential|(?:private|signing|encryption)[_-]?key)/i;
function normalizedProfanityTerm(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^\p{L}\p{N}]/gu, '');
}
export const cloneLevelConfig = (value = DEFAULT_LEVEL_CONFIG) => JSON.parse(JSON.stringify(value));

export function parseDiscordIds(text) {
  return [...new Set(String(text || '').split(/[\s,;]+/).filter(Boolean))];
}

export function parseLevelConfig(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Cấu hình phải là một JSON object.');
  return { ...cloneLevelConfig(), ...cloneLevelConfig(parsed) };
}

export function readLevelConfigResponse(response) {
  if (!response || !Object.hasOwn(response, 'chatLevelConfig')) throw new Error('Máy chủ chưa trả về cấu hình Level Chat. Hãy tải lại trước khi chỉnh sửa.');
  return parseLevelConfig(response.chatLevelConfig);
}

export function validateLevelConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Cấu hình phải là một JSON object.'];
  const errors = [];
  if (new TextEncoder().encode(JSON.stringify(value)).length > 20_000) errors.push('Cấu hình không được vượt quá 20.000 byte.');
  const queue = [value];
  while (queue.length) {
    const current = queue.pop();
    for (const [key, child] of Object.entries(current)) {
      if (SENSITIVE_KEY.test(key)) { errors.push('Không nhập token, secret, mật khẩu hoặc API key vào cấu hình.'); queue.length = 0; break; }
      if (child && typeof child === 'object') queue.push(child);
    }
  }
  if (value.version !== 1) errors.push('Phiên bản cấu hình phải là 1.');
  for (const [key, label] of [['enabled', 'Bật Level Chat'], ['announcementEnabled', 'Thông báo lên cấp'], ['imageEnabled', 'Ảnh thẻ cấp độ']]) {
    if (typeof value[key] !== 'boolean') errors.push(`${label} phải là true hoặc false.`);
  }
  for (const [key, label, max] of [['requiredVerifiedRoleIds', 'Role xác minh', 50], ['allowedChannelIds', 'Kênh nhận EXP', 100], ['adminRoleIds', 'Role quản trị', 50]]) {
    if (!Array.isArray(value[key]) || value[key].length > max || value[key].some((id) => typeof id !== 'string' || !DISCORD_ID.test(id))) errors.push(`${label}: tối đa ${max} ID Discord, mỗi ID gồm 15–22 chữ số.`);
  }
  for (const [key, label, min, max] of [
    ['xpPerMessage', 'EXP mỗi tin', 1, 100], ['minContentLength', 'Ký tự tối thiểu', 1, 1000],
    ['cooldownSeconds', 'Thời gian chờ', 0, 3600], ['similarityWindow', 'Số tin so sánh', 1, 100],
    ['rewardSpins', 'Lượt quay mặc định', 0, 100000], ['maxRewardAttempts', 'Số lần thử thưởng', 1, 100],
    ['rewardRetryBaseSeconds', 'Chờ thử lại ban đầu', 1, 3600],
  ]) {
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) errors.push(`${label} phải là số nguyên từ ${min} đến ${max}.`);
  }
  if (typeof value.similarityThreshold !== 'number' || !Number.isFinite(value.similarityThreshold) || value.similarityThreshold < .5 || value.similarityThreshold > .7) errors.push('Ngưỡng tương đồng phải từ 0.5 đến 0.7 để luôn chặn tin giống 70% trở lên.');
  if (!Array.isArray(value.profanityTerms) || value.profanityTerms.length > 100 || value.profanityTerms.some((term) => typeof term !== 'string' || !term.trim() || term.length > 64 || !normalizedProfanityTerm(term))) errors.push('Danh sách từ giảm EXP: tối đa 100 từ/cụm từ, mỗi mục 1–64 ký tự và phải chứa chữ hoặc số.');
  if (typeof value.profanityXpMultiplier !== 'number' || !Number.isFinite(value.profanityXpMultiplier) || value.profanityXpMultiplier < .1 || value.profanityXpMultiplier > .9) errors.push('Tỷ lệ EXP khi có từ bậy phải từ 0.1 đến 0.9.');
  if (typeof value.minecraftServiceId !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(value.minecraftServiceId)) errors.push('Service ID cần 1–64 chữ cái, chữ số, dấu chấm, gạch dưới hoặc gạch ngang.');
  if (value.announcementChannelId !== null && (typeof value.announcementChannelId !== 'string' || !DISCORD_ID.test(value.announcementChannelId))) errors.push('Kênh thông báo phải trống hoặc là ID Discord 15–22 chữ số.');
  if (typeof value.accentColor !== 'string' || !/^#[\da-f]{6}$/i.test(value.accentColor)) errors.push('Màu thẻ cần mã hex 6 chữ số, ví dụ #5865F2.');
  for (const [key, label, validRow] of [
    ['levelRoles', 'Role theo cấp', (row) => typeof row.roleId === 'string' && DISCORD_ID.test(row.roleId)],
    ['rewardMilestones', 'Mốc thưởng', (row) => Number.isInteger(row.spins) && row.spins >= 0 && row.spins <= 100000],
  ]) {
    if (!Array.isArray(value[key]) || value[key].length > 100 || value[key].some((row) => !row || !Number.isInteger(row.minLevel) || row.minLevel < 1 || row.minLevel > 100000 || !validRow(row))) errors.push(`${label}: tối đa 100 mốc; level nguyên 1–100000 và ${key === 'levelRoles' ? 'role ID hợp lệ' : 'lượt quay nguyên 0–100000'}.`);
  }
  return errors;
}

export function rewardState(item) {
  const raw = String(item?.status || '').toUpperCase();
  const labels = { PENDING: 'Chờ xử lý', LEASED: 'Đang cấp', DEFERRED: 'Đã hoãn', COMPLETED: 'Đã hoàn tất', FAILED: 'Thất bại' };
  return { raw, label: labels[raw] || raw || 'Không rõ', retryable: raw === 'DEFERRED' || raw === 'FAILED' };
}

export function isLevelDraftDirty(config, baseline) {
  return baseline !== null && JSON.stringify(config) !== baseline;
}
