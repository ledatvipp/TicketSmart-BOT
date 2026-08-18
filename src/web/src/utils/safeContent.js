const HTTPS_PROTOCOLS = new Set(['https:']);

export function normalizeExternalUrl(value, { allowHttp = false } = {}) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const parsed = new URL(value);
    const allowed = allowHttp ? new Set(['https:', 'http:']) : HTTPS_PROTOCOLS;
    if (!allowed.has(parsed.protocol)) return '';
    if (parsed.username || parsed.password) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}


const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\r\n]+$/i;

export function normalizeImageUrl(value, { allowHttp = true, allowData = true, allowBlob = true } = {}) {
  if (typeof value !== 'string' || value.length > 8 * 1024 * 1024) return '';
  const trimmed = value.trim();
  if (allowData && SAFE_DATA_IMAGE_RE.test(trimmed)) return trimmed;
  if (allowBlob && trimmed.startsWith('blob:')) {
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'blob:' ? parsed.toString() : '';
    } catch { return ''; }
  }
  return normalizeExternalUrl(trimmed, { allowHttp });
}

export function isSupportedImageFile(file, maxBytes = 5 * 1024 * 1024) {
  return Boolean(file && ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type) && file.size > 0 && file.size <= maxBytes);
}

export function highlightedParts(content, query) {
  const text = String(content ?? '');
  const needle = String(query ?? '').trim();
  if (!needle) return [{ text, match: false }];

  const lowerText = text.toLocaleLowerCase('vi');
  const lowerNeedle = needle.toLocaleLowerCase('vi');
  const parts = [];
  let cursor = 0;
  let index = lowerText.indexOf(lowerNeedle);

  while (index !== -1) {
    if (index > cursor) parts.push({ text: text.slice(cursor, index), match: false });
    parts.push({ text: text.slice(index, index + needle.length), match: true });
    cursor = index + needle.length;
    index = lowerText.indexOf(lowerNeedle, cursor);
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts.length ? parts : [{ text, match: false }];
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN');
}

function renderAttachment(attachment) {
  const url = normalizeExternalUrl(attachment?.url, { allowHttp: true });
  const name = escapeHtml(attachment?.name || 'Attachment');
  if (!url) return `<span class="attachment-item blocked"><span aria-hidden="true">📎</span>${name} (URL không hợp lệ)</span>`;
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow" referrerpolicy="no-referrer" class="attachment-item"><span aria-hidden="true">📎</span>${name}</a>`;
}

export function renderSafeTicketHtml(ticket, messages, { includeInternal = false } = {}) {
  const t = ticket || {};
  const rows = Array.isArray(messages) ? messages.filter((message) => includeInternal || !message?.isInternal) : [];
  const ticketNumber = String(t.ticketNum ?? 0).padStart(4, '0');
  const title = `Transcript Ticket #${ticketNumber}`;

  const messageHtml = rows.map((message) => {
    const authorName = escapeHtml(message?.authorName || 'Không rõ');
    const avatarUrl = normalizeExternalUrl(message?.authorAvatar, { allowHttp: true });
    const avatar = avatarUrl
      ? `<img src="${escapeHtml(avatarUrl)}" class="avatar" alt="" referrerpolicy="no-referrer" loading="lazy">`
      : `<div class="avatar-placeholder">${escapeHtml((message?.authorName || '?').slice(0, 1).toUpperCase())}</div>`;
    const isStaff = !message?.isBot && message?.authorId !== t.creatorId;
    const classes = `msg${isStaff ? ' msg-staff' : ''}${message?.isInternal ? ' msg-internal' : ''}`;
    const badges = [
      message?.isBot ? '<span class="badge bot-badge">BOT</span>' : '',
      isStaff ? '<span class="badge staff-badge">STAFF</span>' : '',
      message?.isInternal ? '<span class="badge internal-badge">NỘI BỘ</span>' : '',
    ].join('');
    const content = escapeHtml(message?.content || '').replaceAll('\n', '<br>');
    const attachments = Array.isArray(message?.attachments)
      ? message.attachments.filter((item) => !item?.kind || item.kind === 'attachment').map(renderAttachment).join('')
      : '';

    return `<article class="${classes}">
      ${avatar}
      <div class="msg-body">
        <header class="msg-header"><span class="author">${authorName}</span>${badges}<time>${escapeHtml(safeDate(message?.timestamp))}</time></header>
        <div class="content">${content || '<em>(trống)</em>'}</div>
        ${attachments ? `<div class="attachments">${attachments}</div>` : ''}
      </div>
    </article>`;
  }).join('\n');

  const meta = [
    ['Người tạo', t.creatorName || 'Không rõ'],
    ['Phân loại', `${t.option?.emoji || '◈'} ${t.option?.name || 'Chung'}`],
    ['Độ ưu tiên', t.priority || 'normal'],
    ['Thời gian mở', safeDate(t.openedAt)],
    ...(t.closedAt ? [['Thời gian đóng', safeDate(t.closedAt)], ['Lý do đóng', t.closeReason || 'Không có lý do']] : []),
  ].map(([label, value]) => `<div class="meta-item"><div class="meta-label">${escapeHtml(label)}</div><div class="meta-value">${escapeHtml(value)}</div></div>`).join('');

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; connect-src 'none'; script-src 'none'">
  <meta name="referrer" content="no-referrer">
  <title>${escapeHtml(title)}</title>
  <style>
    :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;padding:40px 20px;background:#313338;color:#dbdee1;font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}.container{max-width:1000px;margin:auto;overflow:hidden;border:1px solid #3f4147;border-radius:10px;background:#2b2d31;box-shadow:0 4px 20px #0006}.header{padding:30px;border-bottom:1px solid #3f4147;background:#1e1f22}.header h1{margin:0;color:#fff}.meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-top:20px}.meta-item{padding:12px 16px;border:1px solid #383a40;border-radius:6px;background:#111214}.meta-label{margin-bottom:4px;color:#949ba4;font-size:11px;font-weight:700;text-transform:uppercase}.meta-value{overflow-wrap:anywhere;color:#f2f3f5}.chat-area{padding:20px 30px}.msg{display:flex;gap:16px;margin:8px 0;padding:12px 16px;border-radius:6px}.msg-staff{border-left:3px solid #cebdff;background:#9d7bff0d}.msg-internal{border:1px dashed #f0b232;background:#f0b23210}.avatar,.avatar-placeholder{width:40px;height:40px;flex:0 0 40px;border-radius:50%}.avatar{object-fit:cover}.avatar-placeholder{display:grid;place-items:center;background:#4e5058;color:#fff;font-weight:700}.msg-body{min-width:0;flex:1}.msg-header{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:4px}.author{color:#f2f3f5;font-weight:600}.badge{padding:2px 6px;border-radius:3px;font-size:9px;font-weight:700}.bot-badge{background:#5865f2;color:#fff}.staff-badge{background:#cebdff;color:#390094}.internal-badge{background:#f0b232;color:#231b00}.msg-header time{color:#949ba4;font-size:12px}.content{overflow-wrap:anywhere;white-space:normal}.attachments{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin-top:8px}.attachment-item{display:inline-flex;gap:8px;max-width:100%;padding:8px 12px;border:1px solid #1e1f22;border-radius:4px;background:#35373c;color:#00a8fc;overflow-wrap:anywhere;text-decoration:none}.attachment-item.blocked{color:#949ba4}.footer{padding:20px 30px;border-top:1px solid #3f4147;background:#111214;color:#949ba4;text-align:center;font-size:12px}
  </style>
</head>
<body>
  <main class="container">
    <header class="header"><h1>${escapeHtml(title)}</h1><div class="meta-grid">${meta}</div></header>
    <section class="chat-area">${messageHtml || '<p>Không có tin nhắn.</p>'}</section>
    <footer class="footer">Generated by Discord Ticket System Web Dashboard</footer>
  </main>
</body>
</html>`;
}
