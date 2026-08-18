const MAX_BUTTONS = 10;

function safeJson(value, fallback = []) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeArticleActions(value) {
  return safeJson(value)
    .map((raw) => {
      const action = typeof raw === 'string' ? { type: raw } : raw;
      if (!action || typeof action !== 'object') return null;
      const type = String(action.type || '').toLowerCase();
      if (type === 'ticket') return {
        type,
        label: String(action.label || 'Tạo ticket').slice(0, 80),
        emoji: String(action.emoji || '🎫').slice(0, 8),
        optionId: action.optionId ? String(action.optionId) : null,
      };
      if (type === 'escalate') return {
        type,
        label: String(action.label || 'Gọi staff').slice(0, 80),
        emoji: String(action.emoji || '🆘').slice(0, 8),
      };
      if (type === 'link') {
        const url = safeUrl(action.url);
        return url ? { type, label: String(action.label || 'Mở hướng dẫn').slice(0, 80), emoji: String(action.emoji || '🔗').slice(0, 8), url } : null;
      }
      if (type === 'channel' && /^\d{15,22}$/.test(String(action.channelId || ''))) return {
        type,
        label: String(action.label || 'Mở channel').slice(0, 80),
        emoji: String(action.emoji || '💬').slice(0, 8),
        channelId: String(action.channelId),
      };
      return null;
    })
    .filter(Boolean)
    .slice(0, MAX_BUTTONS);
}

export function buildActionPlan({ intent, option, article, config = {}, guildId, userId, detectionId, clusterKey = null }) {
  const actions = [];
  const add = (action) => {
    const key = `${action.type}:${action.optionId || action.url || action.channelId || ''}`;
    if (!actions.some((item) => item._key === key)) actions.push({ ...action, _key: key });
  };

  if (intent.action === 'CREATE_TICKET' && option) {
    add({ type: 'ticket', optionId: option.id, label: intent.buttonLabel || 'Tạo ticket', emoji: '🎫', style: 'primary' });
  }

  for (const action of normalizeArticleActions(article?.actions)) {
    if (action.type === 'ticket') add({ ...action, optionId: action.optionId || option?.id || null, style: 'primary' });
    else add(action);
  }

  if (intent.action !== 'CREATE_TICKET' && option) {
    add({ type: 'ticket', optionId: option.id, label: intent.buttonLabel || 'Cần staff hỗ trợ', emoji: '🎫', style: 'secondary' });
  }

  if (config.smartEscalationRoleId || config.smartEscalationChannelId) {
    add({ type: 'escalate', label: 'Gọi staff hỗ trợ', emoji: '🆘', style: 'danger' });
  }

  return actions.slice(0, MAX_BUTTONS).map(({ _key, ...action }) => {
    if (action.type === 'ticket' && action.optionId) {
      return { ...action, customId: `smart:ticket:${action.optionId}:${userId}:${detectionId || 'none'}:${clusterKey || 'none'}` };
    }
    if (action.type === 'escalate') {
      return { ...action, customId: `smart:escalate:${userId}:${detectionId || 'none'}` };
    }
    if (action.type === 'channel' && guildId) {
      return { ...action, url: `https://discord.com/channels/${guildId}/${action.channelId}` };
    }
    return action;
  }).filter((action) => action.customId || action.url);
}
