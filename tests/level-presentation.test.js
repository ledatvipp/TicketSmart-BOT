import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { inflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  cardAccent, cardProgress, createRankCardRenderer, escapeCardText, fetchCardAvatar,
  rankCardSvg, renderCardWorker, validateAvatarPng, validateAvatarUrl,
} from '../src/bot/utils/rank-card.js';
import { levelUpEmbed, profileEmbed, sendLevelPayload, withRankCard } from '../src/bot/ui/level-presentation.js';
import { processChatLevelMessage } from '../src/bot/events/messageCreate.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNXsAAAAASUVORK5CYII=', 'base64');
const AVATAR = 'https://cdn.discordapp.com/avatars/123456789012345678/abcdef.png';
const user = { id: '123456789012345678', username: 'Đặng Minh', displayName: 'Đặng Minh', displayAvatarURL: () => AVATAR, toString: () => '<@123456789012345678>' };
const profile = { level: 12, experience: 240, experienceForNextLevel: 400, totalExperience: 3090 };
const result = { awarded: true, profile, experienceGained: 20, crossedLevels: [12], grants: [{ spins: 2 }] };

function pngData(png) {
  assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), scanlines: inflateSync(Buffer.concat(chunks)) };
}

function message() {
  return { id: '223456789012345678', channelId: '323456789012345678', content: 'Một tin nhắn đóng góp cho cộng đồng', author: user,
    guild: { id: '423456789012345678', name: 'IS7MC' }, member: { roles: { cache: new Map() } } };
}

async function httpFixture(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('card progress clamps invalid and excessive input to finite values', () => {
  assert.deepEqual(cardProgress(profile), { level: 12, needed: 400, experience: 240, total: 3090, ratio: 0.6 });
  for (const invalid of [NaN, Infinity, -1, '100', {}, 1.1, Number.MAX_SAFE_INTEGER + 1]) {
    const value = cardProgress({ level: invalid, experience: invalid, totalExperience: invalid, experienceForNextLevel: invalid });
    assert.ok(Object.values(value).every(Number.isFinite));
    assert.ok(value.ratio >= 0 && value.ratio <= 1);
  }
  assert.equal(cardProgress({ experience: 1000, experienceForNextLevel: 10 }).ratio, 1);
  assert.equal(cardProgress({ experienceForNextLevel: 0 }).needed, 1);
  assert.equal(cardAccent('#aAbBcc'), '#aAbBcc');
  assert.equal(cardAccent('url(https://invalid.test)'), '#5865F2');
});

test('SVG escapes user text and never embeds unvalidated avatar content', () => {
  assert.equal(escapeCardText('&<>"\''), '&amp;&lt;&gt;&quot;&apos;');
  const svg = rankCardSvg({ username: '<x>&"\'\u0000', guildName: '<script>alert(1)</script>', profile, avatar: Buffer.from('<svg/>') });
  assert.ok(svg.includes('&lt;x&gt;&amp;&quot;&apos;'));
  assert.ok(svg.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!svg.includes('<script>'));
  assert.ok(!svg.includes('\u0000'));
  assert.ok(!svg.includes('<image'));
  assert.ok(!svg.includes('NaN'));
  assert.match(svg, /<clipPath id="profile-name"><rect x="216" y="124" width="524" height="52"/);
  assert.match(svg, /clip-path="url\(#profile-name\)"/);
  assert.match(svg, /<clipPath id="guild-name"><rect x="54" y="28" width="620" height="30"/);
  assert.match(svg, /clip-path="url\(#guild-name\)"/);
});

test('server header uses the supplied guild name with escaping and a neutral missing-context fallback', () => {
  for (const guildName of ['IS7MC', 'Máy chủ Mây Xanh', 'Realm <A> & "B"']) {
    const svg = rankCardSvg({ guildName, profile });
    assert.match(svg, /<clipPath id="guild-name"><rect x="54" y="28" width="620" height="30"/);
    assert.equal(svg.match(/<text\b[^>]*clip-path="url\(#guild-name\)"[^>]*>(.*?)<\/text>/)?.[1], escapeCardText(guildName));
  }
  for (const guildName of [undefined, null, '']) {
    const svg = rankCardSvg({ guildName, profile });
    assert.equal(svg.match(/<text\b[^>]*clip-path="url\(#guild-name\)"[^>]*>(.*?)<\/text>/)?.[1], 'Tên server');
    assert.ok(!svg.includes('IS7MC'), 'sample branding must not become a production fallback');
  }
});

test('rank-card payload forwards arbitrary guild names unchanged in profile and level-up modes', async () => {
  for (const guildName of ['IS7MC', 'Máy chủ Mây Xanh', 'Realm <A> & "B"']) {
    for (const levelUp of [false, true]) {
      let received;
      const payload = await withRankCard(levelUp ? levelUpEmbed(user, result) : profileEmbed(user, profile), user, profile, {
        guildName, levelUp, render: async (options) => { received = options; return PNG; },
      });
      assert.equal(received.guildName, guildName);
      assert.equal(received.levelUp, levelUp);
      assert.equal(received.profile, profile);
      assert.equal(payload.files[0].name, 'level-card.png');
    }
  }
});

test('segmented XP clip stays inside its track at empty, partial, full and clamped progress', () => {
  for (const [experience, expectedWidth] of [[0, 0], [1, 2.25], [240, 540], [400, 900], [800, 900], [-1, 0], [Infinity, 0]]) {
    const svg = rankCardSvg({ profile: { ...profile, experience } });
    const match = svg.match(/<clipPath id="xp-fill"><rect x="50" y="307" width="([\d.]+)" height="16"/);
    assert.ok(match, 'XP fill has an explicit bounded clip');
    assert.equal(Number(match[1]), expectedWidth);
    assert.ok(Number(match[1]) >= 0 && Number(match[1]) <= 900);
    assert.match(svg, /<g clip-path="url\(#xp-fill\)"><rect x="50" y="307" width="900" height="16" fill="url\(#xp\)"/);
    assert.match(svg, /<pattern id="xp-slots" width="45" height="16"/);
    assert.match(svg, /<rect x="50" y="307" width="900" height="16" fill="url\(#xp-slots\)"/);
  }
});

test('voxel card keeps distinct ASCII modes, configurable accent and bounded text geometry', () => {
  const options = { username: 'W'.repeat(280), guildName: 'Đặng Việt '.repeat(100), profile, accentColor: '#F97316' };
  const rank = rankCardSvg(options);
  const levelUp = rankCardSvg({ ...options, levelUp: true });
  assert.match(rank, /font-family="Press Start 2P"[^>]*>PLAYER STATS</);
  assert.match(levelUp, /font-family="Press Start 2P"[^>]*>LEVEL UP!</);
  assert.match(levelUp, />NEW LEVEL</);
  assert.ok(!rank.includes('LEVEL UP!'));
  assert.match(rank, /fill="#F97316"/);
  assert.match(rank, /<clipPath id="avatar"><rect x="54" y="106" width="128" height="128"/);
  assert.match(rank, /clip-path="url\(#profile-name\)"/);
  assert.match(rank, /clip-path="url\(#guild-name\)"/);
  assert.ok(!rank.includes('W'.repeat(29)), 'long profile names are bounded before rendering');
  const basic = rankCardSvg({ username: 'A', guildName: 'B', profile });
  assert.equal((rank.match(/<\w/g) || []).length, (basic.match(/<\w/g) || []).length, 'input length cannot create unbounded scenery geometry');
});

test('card atmosphere and five enchantment sparkles stay deterministic and input bounded', () => {
  for (const levelUp of [false, true]) {
    const options = { username: user.username, guildName: 'IS7MC', profile, levelUp };
    const svg = rankCardSvg(options);
    assert.equal(svg, rankCardSvg(options), 'decorations must not depend on randomness or time');
    const sparkleGroup = new RegExp(`<g opacity="${levelUp ? '\\.9' : '\\.35'}" shape-rendering="crispEdges">([\\s\\S]*?)</g>`);
    const sparkles = svg.match(sparkleGroup)?.[1];
    assert.ok(sparkles, 'bounded sparkle group is present');
    assert.equal((sparkles.match(/<path /g) || []).length, 5);
    assert.equal((sparkles.match(new RegExp(`fill="${levelUp ? '#e9c66a' : '#8eda8d'}"`, 'g')) || []).length, 5);
    const excessive = rankCardSvg({ ...options, username: 'W'.repeat(10000), guildName: 'Đặng '.repeat(10000), profile: { ...profile, level: Number.MAX_SAFE_INTEGER } });
    assert.equal(excessive.match(sparkleGroup)?.[1], sparkles, 'user input cannot add decorative work');
    assert.match(svg, /<radialGradient id="aura"/);
    assert.match(svg, /fill="url\(#badge\)"/);
    assert.match(svg, /fill="url\(#panel\)"/);
    assert.doesNotMatch(svg, /<(?:filter|animate|animateTransform|foreignObject)\b/);
  }
});

test('XP gleam and lower shading paint only inside the filled progress clip', { timeout: 10000 }, async () => {
  for (const experience of [0, 240, 400]) {
    const svg = rankCardSvg({ profile: { ...profile, experience } });
    const fillGroup = svg.match(/<g clip-path="url\(#xp-fill\)">([\s\S]*?)<\/g>/);
    assert.ok(fillGroup);
    assert.equal((fillGroup[1].match(/<path /g) || []).length, 2);
    assert.match(fillGroup[1], /<path d="M50 307H950V310H50Z" fill="#ecffc6"/);
    assert.match(fillGroup[1], /<path d="M50 320H950V323H50Z" fill="#2c6e24"/);
    assert.equal((svg.match(/fill="#ecffc6"/g) || []).length, 1, 'gleam is not repeated outside the progress clip');
    if (experience === 240) continue;
    const withoutGleam = svg.replace(fillGroup[0], fillGroup[0].replace(/<path\b[^>]*\/>/g, ''));
    const withEffects = await renderCardWorker(svg);
    const withoutEffects = await renderCardWorker(withoutGleam);
    if (experience === 0) assert.deepEqual(withEffects, withoutEffects, 'empty progress must paint no gleam or filled shading');
    else assert.notDeepEqual(withEffects, withoutEffects, 'full progress must really render its clipped depth effects');
  }
});

test('real worker creates rank and level-up PNGs and renders bundled Vietnamese font', { timeout: 20000 }, async () => {
  const options = { username: user.username, guildName: 'IS7MC', profile, position: 8 };
  const rank = await renderCardWorker(rankCardSvg(options));
  const level = await renderCardWorker(rankCardSvg({ ...options, levelUp: true }));
  for (const png of [rank, level]) {
    const decoded = pngData(png);
    assert.equal(decoded.width, 1000);
    assert.equal(decoded.height, 360);
    assert.ok(png.length > 10000, 'actual rendered image contains nontrivial content');
  }
  assert.notDeepEqual(rank, level);
  const fontProbe = await renderCardWorker('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="60"><text x="4" y="40" font-family="Noto Sans" font-size="30" fill="white">Đặng Tiến • Cấp độ</text></svg>');
  assert.ok(pngData(fontProbe).scanlines.reduce((sum, byte) => sum + byte, 0) > 10000, 'text paints pixels with system fonts disabled');
  const wideName = await renderCardWorker(rankCardSvg({ username: 'W'.repeat(28), guildName: 'W'.repeat(48), profile }));
  assert.equal(pngData(wideName).width, 1000);
  const variants = {
    'sample-rank-card.png': rank,
    'sample-level-up-card.png': level,
    'sample-wide-name-card.png': wideName,
    'sample-vietnamese-name-card.png': await renderCardWorker(rankCardSvg({ ...options, username: 'Đặng Nguyễn Hoàng Trường Thiên Vương', guildName: 'Cộng đồng Việt Nam • Hành trình khám phá và xây dựng thế giới' })),
    'sample-empty-xp-card.png': await renderCardWorker(rankCardSvg({ ...options, profile: { ...profile, experience: 0 } })),
    'sample-full-xp-card.png': await renderCardWorker(rankCardSvg({ ...options, profile: { ...profile, experience: 400 } })),
    'sample-custom-accent-card.png': await renderCardWorker(rankCardSvg({ ...options, accentColor: '#F97316' })),
    'sample-large-values-card.png': await renderCardWorker(rankCardSvg({ ...options, profile: { level: Number.MAX_SAFE_INTEGER, experience: Number.MAX_SAFE_INTEGER, experienceForNextLevel: Number.MAX_SAFE_INTEGER, totalExperience: Number.MAX_SAFE_INTEGER }, position: Number.MAX_SAFE_INTEGER })),
  };
  for (const png of Object.values(variants)) {
    assert.equal(pngData(png).width, 1000);
    assert.equal(pngData(png).height, 360);
  }
  assert.notDeepEqual(variants['sample-empty-xp-card.png'], variants['sample-full-xp-card.png']);
  assert.notDeepEqual(rank, variants['sample-custom-accent-card.png']);
  if (process.env.LEVEL_CARD_PREVIEW_DIR) {
    await mkdir(process.env.LEVEL_CARD_PREVIEW_DIR, { recursive: true });
    for (const [name, png] of Object.entries(variants)) await writeFile(join(process.env.LEVEL_CARD_PREVIEW_DIR, name), png);
  }
});

test('worker paints the bundled ASCII pixel font distinctly from the Vietnamese font', { timeout: 10000 }, async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="80"><text x="4" y="48" font-family="Press Start 2P" font-size="24" fill="white">LEVEL UP! 0123456789</text></svg>';
  const pixelFont = await renderCardWorker(svg);
  const notoFont = await renderCardWorker(svg.replace('Press Start 2P', 'Noto Sans'));
  assert.ok(pngData(pixelFont).scanlines.reduce((sum, byte) => sum + byte, 0) > 10000, 'pixel font must paint real image content');
  assert.notDeepEqual(pixelFont, notoFont, 'a missing pixel font must not silently use the Noto fallback');
});

test('real worker embeds a locally generated pixel avatar PNG without network access', { timeout: 10000 }, async () => {
  const avatar = await renderCardWorker('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" shape-rendering="crispEdges"><rect width="64" height="64" fill="#523928"/><rect x="8" y="16" width="48" height="40" fill="#dbab7f"/><path d="M8 16h48v8H40v-8H24v8H8Z" fill="#6c482b"/><path d="M16 32h8v8h-8zm24 0h8v8h-8z" fill="#3bdfd0"/><rect x="24" y="48" width="16" height="8" fill="#724632"/></svg>');
  assert.equal(validateAvatarPng(avatar), true);
  const options = { username: user.username, guildName: 'IS7MC', profile, position: 8 };
  const svg = rankCardSvg({ ...options, avatar });
  assert.match(svg, /<image[^>]+href="data:image\/png;base64,/);
  const card = await renderCardWorker(svg);
  assert.equal(pngData(card).width, 1000);
  assert.notDeepEqual(card, await renderCardWorker(rankCardSvg(options)));
  if (process.env.LEVEL_CARD_PREVIEW_DIR) {
    await mkdir(process.env.LEVEL_CARD_PREVIEW_DIR, { recursive: true });
    await writeFile(join(process.env.LEVEL_CARD_PREVIEW_DIR, 'sample-avatar-card.png'), card);
  }
});

test('avatar URL validation allows only bounded Discord PNG routes', () => {
  assert.equal(validateAvatarUrl(`${AVATAR}?size=4096&redirect=evil`), `${AVATAR}?size=256`);
  assert.equal(validateAvatarUrl('https://cdn.discordapp.com/embed/avatars/0.png'), 'https://cdn.discordapp.com/embed/avatars/0.png?size=256');
  for (const url of [AVATAR.replace('https:', 'http:'), AVATAR.replace('cdn.discordapp.com', 'cdn.discordapp.com.evil.test'),
    AVATAR.replace('cdn.discordapp.com', '127.0.0.1'), AVATAR.replace('.png', '.gif'), AVATAR.replace('/avatars/', '/attachments/'),
    AVATAR.replace('https://', 'https://name:pass@'), AVATAR.replace('.com/', '.com:8443/'), `${AVATAR}#fragment`, 'file:///etc/passwd', 'data:image/png;base64,aA==']) {
    assert.equal(validateAvatarUrl(url), null, url);
  }
});

test('avatar PNG validation bounds signature, IHDR, dimensions and bytes', () => {
  assert.equal(validateAvatarPng(PNG), true);
  assert.equal(validateAvatarPng(new Uint8Array(PNG)), false);
  assert.equal(validateAvatarPng(PNG.subarray(0, 20)), false);
  assert.equal(validateAvatarPng(Buffer.alloc(512 * 1024 + 1)), false);
  for (const [offset, value] of [[8, 12], [16, 0], [16, 1025], [20, 0], [20, 1025]]) {
    const invalid = Buffer.from(PNG);
    invalid.writeUInt32BE(value, offset);
    assert.equal(validateAvatarPng(invalid), false);
  }
  const wrongSignature = Buffer.from(PNG); wrongSignature[0] = 0;
  assert.equal(validateAvatarPng(wrongSignature), false);
  const wrongHeader = Buffer.from(PNG); wrongHeader.write('IDAT', 12);
  assert.equal(validateAvatarPng(wrongHeader), false);
});

test('avatar fetching checks MIME, headers, streaming byte limits and blocked URLs', async () => {
  let called = false;
  assert.equal(await fetchCardAvatar('http://127.0.0.1/private', { fetchImpl: () => { called = true; } }), null);
  assert.equal(called, false);
  const fetchImpl = async (url, options) => {
    assert.equal(url, `${AVATAR}?size=256`);
    assert.equal(options.redirect, 'error');
    return new Response(PNG, { headers: { 'content-type': 'image/png; charset=binary' } });
  };
  assert.deepEqual(await fetchCardAvatar(AVATAR, { fetchImpl }), PNG);
  for (const response of [new Response(PNG, { status: 404 }), new Response(PNG, { headers: { 'content-type': 'image/jpeg' } }),
    new Response(PNG, { headers: { 'content-type': 'image/png', 'content-length': String(512 * 1024 + 1) } }),
    new Response(Buffer.alloc(512 * 1024 + 1), { headers: { 'content-type': 'image/png' } }),
    new Response('not png', { headers: { 'content-type': 'image/png' } }),
    new Response(null, { headers: { 'content-type': 'image/png' } })]) {
    assert.equal(await fetchCardAvatar(AVATAR, { fetchImpl: async () => response }), null);
  }
});

test('avatar fetch rejects real redirects without following target', async (t) => {
  let targetHits = 0;
  const base = await httpFixture(t, (req, res) => {
    if (req.url === '/target') { targetHits++; res.end(PNG); }
    else { res.writeHead(302, { location: '/target' }); res.end(); }
  });
  assert.equal(await fetchCardAvatar(AVATAR, { fetchImpl: (_url, options) => fetch(base, options) }), null);
  assert.equal(targetHits, 0);
});

test('avatar fetch aborts stalled HTTP body within its deadline', { timeout: 5000 }, async (t) => {
  const base = await httpFixture(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'image/png' });
    res.write(PNG.subarray(0, 16));
  });
  const start = Date.now();
  assert.equal(await fetchCardAvatar(AVATAR, { timeoutMs: 50, fetchImpl: (_url, options) => fetch(base, options) }), null);
  assert.ok(Date.now() - start < 2000);
});

test('renderer caps concurrency without a queue and recovers on failure', async () => {
  const pending = [];
  let renders = 0;
  const renderer = createRankCardRenderer({ maxConcurrent: 2, loadAvatar: async () => null, render: () => {
    renders++;
    return new Promise((resolve, reject) => pending.push({ resolve, reject }));
  } });
  const first = renderer({ profile }); const second = renderer({ profile });
  await Promise.resolve();
  assert.equal(await renderer({ profile }), null);
  assert.equal(renders, 2);
  pending.shift().reject(new Error('native render failed'));
  assert.equal(await first, null);
  const third = renderer({ profile }); await Promise.resolve();
  assert.equal(renders, 3);
  pending.shift().resolve(PNG); pending.shift().resolve(PNG);
  assert.deepEqual(await second, PNG); assert.deepEqual(await third, PNG);
});

test('avatar loader errors release renderer capacity', async () => {
  let attempts = 0;
  const renderer = createRankCardRenderer({ maxConcurrent: 1, loadAvatar: async () => { if (++attempts === 1) throw new Error('avatar failed'); return null; }, render: async () => PNG });
  assert.equal(await renderer({ profile }), null);
  assert.deepEqual(await renderer({ profile }), PNG);
});

test('worker timeout and invalid SVG recover without poisoning render capacity', { timeout: 15000 }, async () => {
  await assert.rejects(renderCardWorker(rankCardSvg({ profile }), { timeoutMs: 0 }), /timeout/);
  await assert.rejects(renderCardWorker('not an svg'), /Không thể tạo ảnh/);
  let attempts = 0;
  const renderer = createRankCardRenderer({ maxConcurrent: 1, loadAvatar: async () => null,
    render: (svg) => renderCardWorker(svg, { timeoutMs: ++attempts === 1 ? 0 : 4000 }) });
  assert.equal(await renderer({ profile }), null);
  assert.equal(pngData(await renderer({ profile })).width, 1000);
});

test('disabled images skip renderer and errors or saturation preserve embed', async () => {
  let calls = 0;
  const disabled = await withRankCard(profileEmbed(user, profile), user, profile, { config: { imageEnabled: false }, render: async () => { calls++; return PNG; } });
  assert.equal(calls, 0); assert.equal(disabled.files, undefined);
  for (const render of [async () => null, async () => { throw new Error('renderer unavailable'); }]) {
    const payload = await withRankCard(profileEmbed(user, profile), user, profile, { render });
    assert.equal(payload.files, undefined);
    assert.equal(payload.embeds.length, 1);
    assert.equal(payload.embeds[0].toJSON().image, undefined);
    assert.deepEqual(payload.allowedMentions, { parse: [], repliedUser: false });
  }
});

test('attachment payload uses safe mentions and definite Discord rejection retries only as embed', async () => {
  for (const code of [50013, 50035]) {
    const payload = await withRankCard(profileEmbed(user, profile), user, profile, { render: async () => PNG });
    assert.equal(payload.files[0].name, 'level-card.png');
    assert.equal(payload.embeds[0].toJSON().image.url, 'attachment://level-card.png');
    const sent = [];
    const delivered = await sendLevelPayload(async (body) => { sent.push(body); if (sent.length === 1) throw Object.assign(new Error('Discord rejection'), { code }); return 'sent'; }, payload);
    assert.equal(delivered, 'sent'); assert.equal(sent.length, 2);
    assert.equal(sent[1].files, undefined);
    assert.equal(sent[1].embeds[0].toJSON().image, undefined);
    assert.deepEqual(sent[1].allowedMentions, { parse: [], repliedUser: false });
  }
});

test('ambiguous transport send failure is never retried', async () => {
  const payload = await withRankCard(profileEmbed(user, profile), user, profile, { render: async () => PNG });
  let calls = 0;
  await assert.rejects(sendLevelPayload(async () => { calls++; throw Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }); }, payload), /connection reset/);
  assert.equal(calls, 1);
  await assert.rejects(sendLevelPayload(async () => { throw Object.assign(new Error('forbidden'), { code: 50013 }); }, { embeds: [profileEmbed(user, profile)] }), /forbidden/);
});

test('level-up embed reports queued reward truthfully', () => {
  const embed = levelUpEmbed(user, result, { accentColor: '#18BFA5' }).toJSON();
  assert.equal(embed.color, 0x18BFA5);
  assert.match(embed.fields.find((field) => field.name === 'Phần thưởng Minecraft').value, /2 lượt quay.*hàng đợi/);
});

test('chat level processing skips bot and disabled awards and isolates XP exceptions', async () => {
  let awards = 0;
  const award = async () => { awards++; throw new Error('XP database unavailable'); };
  await processChatLevelMessage({ ...message(), author: { ...user, bot: true } }, { enabled: true }, { award });
  await processChatLevelMessage(message(), { enabled: false }, { award });
  await processChatLevelMessage(message(), undefined, { award });
  assert.equal(awards, 0);
  await assert.doesNotReject(processChatLevelMessage(message(), { enabled: true }, { award }));
  assert.equal(awards, 1);
});

test('role and announcement side effects execute independently after award', async () => {
  const calls = [];
  await processChatLevelMessage(message(), { enabled: true }, {
    award: async () => { calls.push('award'); return result; },
    syncRoles: () => { calls.push('roles'); throw new Error('role hierarchy'); },
    announce: async () => { calls.push('announcement'); throw new Error('send denied'); },
  });
  assert.deepEqual(calls, ['award', 'roles', 'announcement']);
  calls.length = 0;
  await processChatLevelMessage(message(), { enabled: true }, { award: async () => ({ awarded: false }), syncRoles: () => calls.push('roles'), announce: () => calls.push('announce') });
  assert.deepEqual(calls, []);
});

test('missing AttachFiles permission sends level-up embed without an image', async () => {
  const msg = message(); const sent = [];
  const channel = { isTextBased: () => true, permissionsFor: () => ({ has: () => false }), send: async (body) => sent.push(body) };
  msg.guild.members = { me: {} };
  msg.guild.channels = { cache: new Map([[msg.channelId, channel]]) };
  await processChatLevelMessage(msg, { enabled: true, announcementEnabled: true, imageEnabled: true }, { award: async () => result, syncRoles: async () => {} });
  assert.equal(sent.length, 1); assert.equal(sent[0].files, undefined);
  assert.equal(sent[0].embeds[0].toJSON().image, undefined);
  assert.deepEqual(sent[0].allowedMentions, { parse: [], repliedUser: false });
});

test('real level-up announcement PNG uses its Discord guild name', { timeout: 10000 }, async () => {
  for (const guildName of ['IS7MC', 'Máy chủ Biển Xanh']) {
    const msg = message();
    msg.guild.name = guildName;
    msg.author = { ...user, displayAvatarURL: () => undefined };
    const sent = [];
    const channel = { isTextBased: () => true, permissionsFor: () => ({ has: () => true }), send: async (body) => sent.push(body) };
    msg.guild.members = { me: {} };
    msg.guild.channels = { cache: new Map([[msg.channelId, channel]]) };
    await processChatLevelMessage(msg, { enabled: true, announcementEnabled: true, imageEnabled: true }, { award: async () => result, syncRoles: async () => {} });
    assert.equal(sent.length, 1);
    const expected = await renderCardWorker(rankCardSvg({ username: user.displayName, guildName, profile, levelUp: true }));
    assert.deepEqual(sent[0].files?.[0].attachment, expected);
  }
});
