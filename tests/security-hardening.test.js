import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ValidationError,
  cleanBoolean,
  cleanDiscordId,
  cleanHttpUrl,
  cleanString,
  safeCsvCell,
} from '../src/api/security/validation.js';
import { decodeImageDataUrl } from '../src/lib/media.js';
import { isPublicAddress } from '../src/lib/safeHttp.js';
import { decryptSecret, encryptSecret } from '../src/lib/secrets.js';
import { parseCookies, setRefreshCookie } from '../src/api/security/cookies.js';
import { parseBotActor, safeEqual } from '../src/api/middleware/botAuth.js';
import {
  escapeHtml,
  highlightedParts,
  normalizeExternalUrl,
  normalizeImageUrl,
  renderSafeTicketHtml,
} from '../src/web/src/utils/safeContent.js';

const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl4sAAAAASUVORK5CYII=';

function withEnv(values, callback) {
  const old = {};
  for (const [key, value] of Object.entries(values)) {
    old[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { return callback(); }
  finally {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('validation loại control chars, protocol nguy hiểm và Discord ID sai', () => {
  assert.equal(cleanString('  a\u0000b  '), 'ab');
  assert.equal(cleanBoolean('true'), true);
  assert.equal(cleanDiscordId('123456789012345678'), '123456789012345678');
  assert.throws(() => cleanDiscordId('abc'), ValidationError);
  assert.throws(() => cleanHttpUrl('javascript:alert(1)'), ValidationError);
  assert.throws(() => cleanHttpUrl('https://user:pass@example.com'), ValidationError);
});

test('CSV export chống formula injection', () => {
  assert.equal(safeCsvCell('=HYPERLINK("https://evil")'), '"\'=HYPERLINK(""https://evil"")"');
  assert.equal(safeCsvCell('  +SUM(1,1)'), '"\'  +SUM(1,1)"');
  assert.equal(safeCsvCell('normal'), '"normal"');
});

test('image parser kiểm tra magic bytes, MIME và pixel', () => {
  const image = decodeImageDataUrl(ONE_PIXEL_PNG, { maxBytes: 1024 });
  assert.equal(image.type, 'png');
  assert.equal(image.width, 1);
  assert.equal(image.height, 1);
  assert.throws(() => decodeImageDataUrl(ONE_PIXEL_PNG.replace('image/png', 'image/jpeg')), /MIME/);
  assert.throws(() => decodeImageDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), ValidationError);
  assert.throws(() => decodeImageDataUrl(ONE_PIXEL_PNG, { maxBytes: 10 }), ValidationError);
});

test('SSRF guard chặn private/reserved IP và chỉ cho global unicast', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '203.0.113.8', '::1', 'fc00::1', '2001:db8::1']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('webhook secret dùng AES-GCM và phát hiện ciphertext bị sửa', () => withEnv({
  WEBHOOK_ENCRYPTION_KEY: '11'.repeat(32),
  NODE_ENV: 'test',
}, () => {
  const encrypted = encryptSecret('super-secret');
  assert.match(encrypted, /^enc:v1:/);
  assert.notEqual(encrypted, 'super-secret');
  assert.equal(decryptSecret(encrypted), 'super-secret');
  const payloadIndex = encrypted.indexOf('enc:v1:') + 'enc:v1:'.length;
  const mutated = `${encrypted.slice(0, payloadIndex)}${encrypted[payloadIndex] === 'A' ? 'B' : 'A'}${encrypted.slice(payloadIndex + 1)}`;
  assert.throws(() => decryptSecret(mutated));
}));

test('refresh token cookie là HttpOnly và Secure ở production', () => withEnv({ NODE_ENV: 'production', COOKIE_SECURE: undefined }, () => {
  const headers = new Map();
  const response = {
    getHeader: (name) => headers.get(name),
    setHeader: (name, value) => headers.set(name, value),
  };
  setRefreshCookie(response, 'abc', 60);
  const raw = headers.get('Set-Cookie');
  assert.match(raw, /^__Host-is7_refresh=/);
  assert.match(raw, /HttpOnly/);
  assert.match(raw, /Secure/);
  assert.match(raw, /SameSite=Lax/);
  assert.equal(parseCookies('__Host-is7_refresh=abc%201')['__Host-is7_refresh'], 'abc 1');
}));

test('frontend URL sanitizer chỉ cho protocol ảnh an toàn', () => {
  assert.equal(normalizeExternalUrl('javascript:alert(1)'), '');
  assert.equal(normalizeExternalUrl('https://example.com/a.png'), 'https://example.com/a.png');
  assert.equal(normalizeImageUrl('data:image/svg+xml;base64,PHN2Zz4='), '');
  assert.equal(normalizeImageUrl(ONE_PIXEL_PNG), ONE_PIXEL_PNG);
});

test('highlight và transcript HTML không render nội dung người dùng thành HTML', () => {
  const parts = highlightedParts('<img src=x onerror=alert(1)> Hello', 'hello');
  assert.equal(parts.filter((part) => part.match).length, 1);
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  const html = renderSafeTicketHtml({
    ticketNum: 7,
    creatorId: 'u1',
    creatorName: '<img src=x onerror=1>',
    status: 'open',
    priority: 'normal',
    openedAt: new Date(0).toISOString(),
  }, [{
    authorId: 'u1',
    authorName: '<svg onload=alert(1)>',
    content: '<script>alert(1)</script>',
    timestamp: new Date(0).toISOString(),
    attachments: [{ name: '<b>x</b>', url: 'javascript:alert(1)' }],
  }]);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<svg onload=alert(1)>'));
  assert.ok(!html.includes('href="javascript:'));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /script-src 'none'/);
});


test('bot actor chỉ nhận identity hợp lệ sau lớp bot-secret và không tin field rác', () => {
  const actor = parseBotActor({ headers: {
    'x-bot-actor': JSON.stringify({
      discordId: '123456789012345678', username: 'Reviewer', isAdmin: true,
    }),
  } });
  assert.equal(actor.discordId, '123456789012345678');
  assert.equal(actor.username, 'Reviewer');
  assert.equal(actor.claimedAdmin, true);

  const fallback = parseBotActor({ headers: {
    'x-bot-actor': JSON.stringify({ discordId: '<script>', username: 'x', isAdmin: true }),
  } });
  assert.equal(fallback.discordId, 'bot');
  assert.equal(fallback.claimedAdmin, false);
  assert.equal(safeEqual('same-secret', 'same-secret'), true);
  assert.equal(safeEqual('same-secret', 'different'), false);
});
