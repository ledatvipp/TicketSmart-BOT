import { Worker } from 'node:worker_threads';

const MAX_AVATAR_BYTES = 512 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const numberFormat = new Intl.NumberFormat('vi-VN');

function text(value, limit = 32) {
  return [...String(value ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '')].slice(0, limit).join('');
}

export function escapeCardText(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}

function positiveNumber(value, fallback = 0) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

export function cardProgress(profile = {}) {
  const level = positiveNumber(profile.level);
  const needed = Math.max(1, positiveNumber(profile.experienceForNextLevel, 100 + 25 * level));
  const experience = Math.min(needed, positiveNumber(profile.experience));
  return { level, needed, experience, total: positiveNumber(profile.totalExperience), ratio: experience / needed };
}

export function cardAccent(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#5865F2';
}

export function validateAvatarUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'cdn.discordapp.com' || url.port || url.username || url.password || url.hash) return null;
    if (!/^\/(?:avatars\/\d{15,22}\/[a-f0-9_]+|embed\/avatars\/\d+)\.png$/.test(url.pathname)) return null;
    // Do not forward arbitrary query parameters. The CDN resize bounds the input.
    url.search = '?size=256';
    return url.href;
  } catch { return null; }
}

export function validateAvatarPng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || buffer.length > MAX_AVATAR_BYTES || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return false;
  if (buffer.readUInt32BE(8) !== 13 || buffer.toString('ascii', 12, 16) !== 'IHDR') return false;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return width > 0 && height > 0 && width <= 1024 && height <= 1024;
}

export async function fetchCardAvatar(value, { fetchImpl = fetch, timeoutMs = 2000 } = {}) {
  const url = validateAvatarUrl(value);
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let reader;
  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error' });
    if (!response.ok || response.headers.get('content-type')?.split(';')[0].trim() !== 'image/png') return null;
    if (Number(response.headers.get('content-length')) > MAX_AVATAR_BYTES || !response.body) return null;
    reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > MAX_AVATAR_BYTES) return null;
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    return validateAvatarPng(buffer) ? buffer : null;
  } catch { return null; }
  finally {
    clearTimeout(timer);
    controller.abort();
    if (reader) await reader.cancel().catch(() => {});
  }
}

function grassBlock(x, y, size) {
  // Original, deterministic voxel artwork; no game textures or external assets.
  return `<g transform="translate(${x} ${y}) scale(${size / 32})">
    <path d="M0 0 32-16 64 0 32 16Z" fill="#709e48"/>
    <path d="M0 0 32 16V48L0 32Z" fill="#584934"/>
    <path d="M32 16 64 0V32L32 48Z" fill="#3b3529"/>
    <path d="M0 0 32 16V26L24 22V16L16 12V20L8 16V10L0 6Z" fill="#4e7939"/>
    <path d="M32 16 64 0V9L56 13V20L48 24V18L40 22V30L32 34Z" fill="#365d32"/>
    <path d="M8-1 24-9 32-5 16 3ZM34-7 42-11 54-5 46-1Z" fill="#91b75f"/>
    <path d="M8 21 16 25V31L8 27ZM22 32 28 35V41L22 38Z" fill="#796448"/>
    <path d="M40 33 48 29V35L40 39ZM54 20 60 17V23L54 26Z" fill="#564d38"/>
  </g>`;
}

function diamond(x, y, scale = 1) {
  return `<g transform="translate(${x} ${y}) scale(${scale})" shape-rendering="crispEdges">
    <path d="M12 0H36V6H42V12H48V24H42V30H36V36H30V42H18V36H12V30H6V24H0V12H6V6H12Z" fill="#073e46"/>
    <path d="M12 6H36V12H42V24H36V30H30V36H18V30H12V24H6V12H12Z" fill="#24c4b8"/>
    <path d="M12 6H30V12H18V18H6V12H12Z" fill="#b9fff0"/>
    <path d="M18 12H36V18H30V24H24V30H18V24H12V18H18Z" fill="#67ebd9"/>
    <path d="M36 12H42V24H36V30H30V36H24V24H30V18H36Z" fill="#109698"/>
    <rect x="18" y="6" width="6" height="6" fill="#effff5"/>
  </g>`;
}

export function rankCardSvg({ username, guildName, profile, accentColor, position, levelUp = false, avatar = null } = {}) {
  const { level, needed, experience, total, ratio } = cardProgress(profile);
  const accent = cardAccent(accentColor);
  const name = escapeCardText(text(username || 'Thành viên', 28));
  const guild = escapeCardText(text(guildName || 'Tên server', 48));
  const initial = escapeCardText(text(username || '?', 1).toUpperCase());
  const levelText = String(level);
  const levelSize = Math.min(48, Math.floor(124 / levelText.length));
  const remaining = numberFormat.format(needed - experience);
  const rank = positiveNumber(position);
  const milestoneColor = levelUp ? '#e9c66a' : '#8eda8d';
  // Keep particles deterministic and outside the name/stat regions.
  const sparkles = [[756, 84, 3], [778, 144, 2], [962, 166, 3], [768, 204, 2], [920, 54, 2]]
    .map(([x, y, size]) => `<path d="M${x - size} ${y - size * 3}h${size * 2}v${size * 2}h${size * 2}v${size * 2}h-${size * 2}v${size * 2}h-${size * 2}v-${size * 2}h-${size * 2}v-${size * 2}h${size * 2}Z" fill="${milestoneColor}"/>`).join('');
  const stars = [[692, 36], [738, 72], [914, 34], [958, 84], [772, 42], [678, 94], [954, 160]]
    .map(([x, y], index) => `<rect x="${x}" y="${y}" width="${index % 2 ? 3 : 4}" height="${index % 2 ? 3 : 4}" fill="#c6e6b6" opacity=".45"/>`).join('');
  const avatarMarkup = validateAvatarPng(avatar)
    ? `<image x="54" y="106" width="128" height="128" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar)" href="data:image/png;base64,${avatar.toString('base64')}"/>`
    : `<rect x="54" y="106" width="128" height="128" fill="#172e2b"/><path d="M54 106H182V134H154V162H126V190H98V218H54Z" fill="${accent}" opacity=".24"/>
      <text x="120" y="192" text-anchor="middle" font-size="64" font-weight="700" fill="#060f0c">${initial}</text>
      <text x="118" y="188" text-anchor="middle" font-size="64" font-weight="700" fill="#f1f8df">${initial}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="360" viewBox="0 0 1000 360">
  <defs>
    <linearGradient id="bg" x2="1" y2=".5"><stop stop-color="#101b20"/><stop offset=".6" stop-color="#102622"/><stop offset="1" stop-color="#244335"/></linearGradient>
    <radialGradient id="aura" gradientUnits="userSpaceOnUse" cx="868" cy="142" r="300"><stop stop-color="#37c5ad" stop-opacity=".27"/><stop offset="1" stop-color="#37c5ad" stop-opacity="0"/></radialGradient>
    <linearGradient id="badge" x2=".6" y2="1"><stop stop-color="#254b40"/><stop offset=".5" stop-color="#102b26"/><stop offset="1" stop-color="#081713"/></linearGradient>
    <linearGradient id="panel" x2="0" y2="1"><stop stop-color="#162a26"/><stop offset="1" stop-color="#0a1617"/></linearGradient>
    <linearGradient id="server-plate"><stop stop-color="#193c30" stop-opacity=".9"/><stop offset="1" stop-color="#193c30" stop-opacity="0"/></linearGradient>
    <linearGradient id="xp" x2="0" y2="1"><stop stop-color="#c6fa6b"/><stop offset=".45" stop-color="#86d444"/><stop offset="1" stop-color="#4d9d31"/></linearGradient>
    <pattern id="stone" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M0 0H24V12H48V24H12V48H0Z" fill="#a4c0aa" opacity=".025"/></pattern>
    <pattern id="xp-slots" width="45" height="16" patternUnits="userSpaceOnUse" x="50" y="307"><rect width="3" height="16" fill="#102019" opacity=".7"/></pattern>
    <clipPath id="card"><path d="M16 6H984V16H994V344H984V354H16V344H6V16H16Z"/></clipPath>
    <clipPath id="avatar"><rect x="54" y="106" width="128" height="128"/></clipPath>
    <clipPath id="profile-name"><rect x="216" y="124" width="524" height="52"/></clipPath>
    <clipPath id="guild-name"><rect x="54" y="28" width="620" height="30"/></clipPath>
    <clipPath id="xp-fill"><rect x="50" y="307" width="${900 * ratio}" height="16"/></clipPath>
  </defs>
  <path d="M12 0H988V12H1000V348H988V360H12V348H0V12H12Z" fill="#070e10"/>
  <g clip-path="url(#card)">
    <rect width="1000" height="360" fill="url(#bg)"/>
    <rect width="1000" height="360" fill="url(#aura)"/>
    <rect width="1000" height="360" fill="url(#stone)"/>
    <path d="M630 168H662V144H694V120H726V144H758V168H806V144H854V120H902V144H950V120H1000V360H630Z" fill="#244333" opacity=".42"/>
    <path d="M670 216H710V184H750V208H790V184H830V160H870V192H910V176H950V200H1000V360H670Z" fill="#122c25"/>
    <path d="M942 90H958V106H974V122H982V150H918V122H926V106H942ZM946 150H954V196H946Z" fill="#39704a" opacity=".48"/>
    ${stars}
    <g opacity="${levelUp ? '.9' : '.35'}" shape-rendering="crispEdges">${sparkles}</g>
    ${grassBlock(730, 222, 27)}${grassBlock(920, 211, 36)}${grassBlock(872, 234, 24)}
    <path d="M16 8H984V12H16ZM8 16H12V344H8Z" fill="#526c5e"/>
    <path d="M984 16H992V344H984ZM16 344H984V352H16Z" fill="#091514"/>
    <rect x="24" y="24" width="4" height="312" fill="${accent}" opacity=".4"/>
    <path d="M18 50V18H50M950 18H982V50M18 310V342H50M950 342H982V310" fill="none" stroke="#90b39a" stroke-width="3" opacity=".7"/>
    <path d="M24 40V24H40M960 24H976V40M24 320V336H40M960 336H976V320" fill="none" stroke="${milestoneColor}" stroke-width="2" opacity=".7"/>
  </g>
  <g font-family="Noto Sans" fill="#eef5e7">
    <path d="M38 24H674V54H38V50H34V28H38Z" fill="url(#server-plate)"/>
    <path d="M38 25H192M35 29V49" fill="none" stroke="#6c987b" stroke-opacity=".6"/>
    <path d="M38 32H48V37H38ZM38 40H48V45H38Z" fill="#0a1917" stroke="#8cb994"/>
    <path d="M40 34H42V36H40ZM40 42H42V44H40Z" fill="${accent}"/>
    <text x="54" y="45" font-size="16" font-weight="700" fill="#e0efd9" clip-path="url(#guild-name)">${guild}</text>
    <text x="958" y="43" text-anchor="end" font-family="Press Start 2P" font-size="10" fill="#a7c4a1">LEVEL CHAT</text>
    <path d="M44 62H192" stroke="#759a80" opacity=".3"/>
    <path d="M44 62H76" stroke="${accent}" stroke-width="2"/>
    <path d="M44 92H190V98H198V244H190V250H44V244H38V98H44Z" fill="#020c0c" opacity=".6"/>
    <path d="M48 94H188V100H194V240H188V246H48V240H42V100H48Z" fill="#060e0e"/>
    <path d="M48 100H188V240H48Z" fill="#52635a"/>
    <path d="M48 100H188V106H54V234H48Z" fill="#8c9e87"/>
    <path d="M182 106H188V240H48V234H182Z" fill="#26362f"/>
    ${avatarMarkup}
    <rect x="55" y="107" width="126" height="126" fill="none" stroke="#d8f1cf" stroke-opacity=".16"/>
    <path d="M46 118V98H66M170 98H190V118M46 226V244H66M170 244H190V226" fill="none" stroke="#b9ceac" stroke-width="3"/>
    <rect x="48" y="240" width="140" height="4" fill="${accent}"/>
    <text x="218" y="86" font-family="Press Start 2P" font-size="${levelUp ? 25 : 19}" fill="#060e0e">${levelUp ? 'LEVEL UP!' : 'PLAYER STATS'}</text>
    <text x="216" y="82" font-family="Press Start 2P" font-size="${levelUp ? 25 : 19}" fill="${levelUp ? '#d4f78c' : '#a5d9b0'}">${levelUp ? 'LEVEL UP!' : 'PLAYER STATS'}</text>
    <text x="216" y="110" font-size="14" fill="#b2c5ae">${levelUp ? 'Chúc mừng! Bạn vừa chinh phục một cấp độ mới.' : 'Mỗi cuộc trò chuyện, một bước tiến mới.'}</text>
    <text x="218" y="165" font-size="37" font-weight="700" fill="#060e0e" clip-path="url(#profile-name)">${name}</text>
    <text x="216" y="161" font-size="37" font-weight="700" clip-path="url(#profile-name)">${name}</text>
    <rect x="216" y="176" width="44" height="3" fill="${accent}"/>
    <path d="M218 200H462V258H218ZM478 200H722V258H478Z" fill="#050e0e" opacity=".6"/>
    <path d="M216 196H460V254H216Z" fill="url(#panel)" stroke="#425e48"/>
    <path d="M476 196H720V254H476Z" fill="url(#panel)" stroke="#425e48"/>
    <path d="M218 210V198H242M478 210V198H502" fill="none" stroke="#8ca97b" opacity=".6"/>
    <text x="232" y="215" font-size="10" font-weight="700" letter-spacing="1" fill="#94ab91">TỔNG TÍCH LŨY</text>
    <text x="232" y="242" font-size="${String(total).length > 10 ? 14 : 20}" font-weight="700">${numberFormat.format(total)} XP</text>
    <text x="492" y="215" font-size="10" font-weight="700" letter-spacing="1" fill="#94ab91">${rank ? 'THỨ HẠNG MÁY CHỦ' : 'ĐỂ LÊN CẤP TIẾP'}</text>
    <text x="492" y="242" font-size="${String(rank || needed).length > 10 ? 14 : 20}" font-weight="700" fill="#d3edb0">${rank ? `#${numberFormat.format(rank)}` : `${remaining} XP`}</text>
    <path d="M796 238H940V246H948V258H788V246H796Z" fill="#061512"/>
    <path d="M796 242H940V248H932V252H804V248H796Z" fill="#48624b"/>
    <path d="M806 248H930V252H806Z" fill="${milestoneColor}" opacity=".45"/>
    <path d="M798 62H938V70H948V236H940V244H798V236H788V70H798Z" fill="#030f10" stroke="#4c7560"/>
    <path d="M802 68H934V76H942V232H934V240H802V232H794V76H802Z" fill="url(#badge)" stroke="${milestoneColor}" stroke-width="2"/>
    <path d="M806 72H930V76H938V228H934V80H802V228H798V80H806Z" fill="${milestoneColor}" opacity=".24"/>
    <path d="M804 90V78H820M916 78H932V90M804 218V230H820M916 230H932V218" fill="none" stroke="${milestoneColor}" stroke-width="2"/>
    <path d="M844 88H892V96H900V120H892V128H844V120H836V96H844Z" fill="#43d9bc" opacity=".09"/>
    ${diamond(840, 84, 1.17)}
    <text x="868" y="149" text-anchor="middle" font-family="Press Start 2P" font-size="10" fill="#afc2a6">${levelUp ? 'NEW LEVEL' : 'LEVEL'}</text>
    <text x="871" y="211" text-anchor="middle" font-family="Press Start 2P" font-size="${levelSize}" fill="#020b09">${levelText}</text>
    <text x="868" y="207" text-anchor="middle" font-family="Press Start 2P" font-size="${levelSize}" fill="${levelUp ? '#f8d77c' : '#dbf3c2'}">${levelText}</text>
    <text x="44" y="286" font-size="13" font-weight="700" fill="#b7cba8">Tiến độ cấp ${numberFormat.format(level + 1)}</text>
    <text x="956" y="286" text-anchor="end" font-size="13" font-weight="700" fill="#dbedc5">${numberFormat.format(experience)} / ${numberFormat.format(needed)} XP · ${Math.floor(ratio * 100)}%</text>
    <rect x="44" y="301" width="912" height="28" fill="#050d0d"/>
    <path d="M46 303H954V305H48V327H46Z" fill="#40513b"/>
    <rect x="50" y="307" width="900" height="16" fill="#253126"/>
    <g clip-path="url(#xp-fill)"><rect x="50" y="307" width="900" height="16" fill="url(#xp)"/><path d="M50 307H950V310H50Z" fill="#ecffc6" opacity=".55"/><path d="M50 320H950V323H50Z" fill="#2c6e24" opacity=".5"/></g>
    <rect x="50" y="307" width="900" height="16" fill="url(#xp-slots)"/>
  </g>
</svg>`;
}

export function renderCardWorker(svg, { timeoutMs = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./rank-card-worker.js', import.meta.url), {
      workerData: { svg },
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 48 },
    });
    let settled = false;
    const finish = async (error, png) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Capacity is released only after the worker has actually stopped.
      await worker.terminate().catch(() => {});
      if (error) reject(error); else resolve(Buffer.from(png));
    };
    const timer = setTimeout(() => finish(new Error('Rank card render timeout')), timeoutMs);
    worker.once('message', (result) => finish(result.error ? new Error(result.error) : null, result.png));
    worker.once('error', (error) => finish(error));
    worker.once('exit', () => { if (!settled) finish(new Error('Rank card worker exited')); });
  });
}

export function createRankCardRenderer({ render = renderCardWorker, loadAvatar = fetchCardAvatar, maxConcurrent = 2 } = {}) {
  let active = 0;
  return async (options) => {
    if (active >= maxConcurrent) return null;
    active += 1;
    try {
      const avatar = await loadAvatar(options.avatarUrl);
      return await render(rankCardSvg({ ...options, avatar }));
    } catch { return null; }
    finally { active -= 1; }
  };
}

export const renderRankCard = createRankCardRenderer();
