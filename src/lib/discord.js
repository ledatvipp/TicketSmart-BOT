// Helper gọi Discord REST trực tiếp từ API
import { Buffer } from 'buffer';

const BASE = 'https://discord.com/api/v10';

function token() {
  const t = process.env.BOT_TOKEN;
  if (!t) throw new Error('BOT_TOKEN chưa cấu hình');
  return t;
}

/**
 * Gửi message vào channel (JSON only)
 */
export async function sendChannelMessage(channelId, { content, embeds, components, allowedMentions, flags } = {}) {
  const body = {};
  if (content !== undefined) body.content = content;
  if (embeds) body.embeds = embeds;
  if (components) body.components = components;
  if (flags !== undefined) body.flags = flags;
  body.allowed_mentions = allowedMentions || { parse: ['users'] };

  const res = await fetch(`${BASE}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Discord REST ${res.status}: ${text}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res.json();
}

export async function getChannelMessages(channelId, { limit = 50 } = {}) {
  const res = await fetch(`${BASE}/channels/${channelId}/messages?limit=${Math.min(100, Math.max(1, limit))}`, {
    headers: { Authorization: `Bot ${token()}` },
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Discord REST ${res.status}: ${text}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res.json();
}

export async function deleteChannelMessage(channelId, messageId) {
  const res = await fetch(`${BASE}/channels/${channelId}/messages/${messageId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bot ${token()}` },
  });

  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    const err = new Error(`Discord REST ${res.status}: ${text}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return true;
}

/**
 * Gửi message với file đính kèm (multipart/form-data)
 * payload: object đầy đủ (content, embeds, allowed_mentions...)
 * file: { name, content (Buffer hoặc string) }
 */
export async function sendChannelMessageMultipart(channelId, payload, fileOrFiles) {
  const boundary = '----TicketHubBoundary' + Math.random().toString(36).slice(2);
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];

  const payloadJson = JSON.stringify({
    ...payload,
    attachments: files.map((f, idx) => ({ id: idx, filename: f.name })),
  });

  // Build multipart body
  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(Buffer.from(`Content-Disposition: form-data; name="payload_json"\r\n`));
  parts.push(Buffer.from(`Content-Type: application/json\r\n\r\n`));
  parts.push(Buffer.from(payloadJson + '\r\n'));

  files.forEach((file, idx) => {
    const fileBuf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(String(file.content), 'utf-8');

    let contentType = 'application/octet-stream';
    const nameLower = file.name.toLowerCase();
    if (nameLower.endsWith('.md')) contentType = 'text/markdown; charset=utf-8';
    else if (nameLower.endsWith('.png')) contentType = 'image/png';
    else if (nameLower.endsWith('.jpg') || nameLower.endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (nameLower.endsWith('.gif')) contentType = 'image/gif';
    else if (nameLower.endsWith('.webp')) contentType = 'image/webp';

    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="files[${idx}]"; filename="${file.name}"\r\n`));
    parts.push(Buffer.from(`Content-Type: ${contentType}\r\n\r\n`));
    parts.push(fileBuf);
    parts.push(Buffer.from(`\r\n`));
  });

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  const res = await fetch(`${BASE}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token()}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Discord REST ${res.status}: ${text}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res.json();
}

/**
 * Gửi DM cho user (mở DM channel rồi send)
 */
export async function sendDM(userId, payload) {
  // Open DM
  const dmRes = await fetch(`${BASE}/users/@me/channels`, {
    method: 'POST',
    headers: { Authorization: `Bot ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient_id: userId }),
  });
  if (!dmRes.ok) throw new Error('Không mở được DM');
  const dm = await dmRes.json();
  return sendChannelMessage(dm.id, payload);
}

/**
 * Gửi DM kèm file
 */
export async function sendDMWithFile(userId, payload, file) {
  const dmRes = await fetch(`${BASE}/users/@me/channels`, {
    method: 'POST',
    headers: { Authorization: `Bot ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient_id: userId }),
  });
  if (!dmRes.ok) throw new Error('Không mở được DM');
  const dm = await dmRes.json();
  return sendChannelMessageMultipart(dm.id, payload, file);
}
