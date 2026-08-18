const VIETNAMESE_MAP = [
  [/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a'],
  [/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e'],
  [/ì|í|ị|ỉ|ĩ/g, 'i'],
  [/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o'],
  [/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u'],
  [/ỳ|ý|ỵ|ỷ|ỹ/g, 'y'],
  [/đ/g, 'd'],
];

// Từ viết tắt/tiếng lóng thường gặp trong cộng đồng Minecraft Việt Nam.
// Chỉ chuẩn hóa các từ có độ chắc chắn cao để không làm hỏng tên người chơi.
const TOKEN_ALIASES = new Map([
  ['sv', 'server'], ['sever', 'server'], ['ser', 'server'], ['maychu', 'server'],
  ['lagg', 'lag'], ['laggg', 'lag'], ['lagg', 'lag'],
  ['inv', 'inventory'], ['inven', 'inventory'],
  ['acc', 'tai khoan'], ['account', 'tai khoan'],
  ['ad', 'admin'], ['adm', 'admin'], ['helper', 'staff'], ['mod', 'staff'],
  ['k', 'khong'], ['ko', 'khong'], ['kh', 'khong'], ['hok', 'khong'], ['hong', 'khong'],
  ['dc', 'duoc'], ['đc', 'duoc'], ['dk', 'duoc'],
  ['r', 'roi'], ['ròi', 'roi'], ['roi', 'roi'],
  ['chx', 'chua'], ['ch', 'chua'], ['chưa', 'chua'],
  ['mun', 'muon'], ['mún', 'muon'], ['bit', 'biet'], ['bít', 'biet'], ['h', 'gio'],
  ['ntn', 'nhu the nao'], ['sao', 'sao'], ['z', 'vay'], ['v', 'vay'],
  ['mn', 'moi nguoi'], ['ae', 'anh em'],
  ['ib', 'nhan tin'], ['inb', 'nhan tin'], ['dm', 'nhan tin'],
  ['rp', 'resource pack'], ['respack', 'resource pack'], ['texturepack', 'resource pack'],
  ['tp', 'teleport'], ['tele', 'teleport'],
  ['warp', 'warp'], ['rtp', 'rtp'], ['claim', 'claim'],
  ['xu', 'xu'], ['point', 'xu'], ['points', 'xu'],
  ['money', 'tien'], ['cash', 'tien'],
  ['bugg', 'bug'], ['loii', 'loi'],
]);

const PHRASE_ALIASES = new Map([
  ['nap the', 'nap tien'],
  ['nap card', 'nap tien'],
  ['chuyen tien', 'thanh toan'],
  ['donate', 'ung ho'],
  ['refund', 'hoan lai'],
  ['mat item', 'mat vat pham'],
  ['bay item', 'mat vat pham'],
  ['xin lam ad', 'xin lam staff'],
  ['xin lam mod', 'xin lam staff'],
  ['xin lam helper', 'xin lam staff'],
  ['khong vao dc', 'khong vao duoc'],
  ['vao khong dc', 'khong vao duoc'],
  ['bi vang ra', 'bi kick'],
  ['bi dis', 'mat ket noi'],
  ['server sap', 'server offline'],
]);

const DOMAIN_VOCAB = new Set([
  'server', 'staff', 'admin', 'inventory', 'vat', 'pham', 'mat', 'lag', 'rollback',
  'ticket', 'nap', 'tien', 'thanh', 'toan', 'rank', 'xu', 'ung', 'ho', 'su', 'kien',
  'event', 'boss', 'koth', 'resource', 'pack', 'texture', 'model', 'claim', 'warp',
  'rtp', 'kit', 'code', 'store', 'dungeon', 'trade', 'auction', 'cho', 'den', 'cau',
  'ca', 'ga', 'trung', 'quest', 'nhiem', 'vu', 'mobcoin', 'soul', 'ban', 'mute',
  'khang', 'an', 'report', 'hack', 'scam', 'lua', 'dao', 'loi', 'bug', 'crash',
  'ket', 'noi', 'offline', 'online', 'bao', 'tri', 'version', 'phien', 'ban',
  'minecraft', 'java', 'launcher', 'dang', 'nhap', 'nhan', 'tai', 'khoan', 'discord',
  'khong', 'chua', 'muon', 'biet', 'gio', 'cach', 'duoc', 'roi', 'toi', 'minh',
  'link', 'lien', 'ket', 'quy', 'dinh', 'huong', 'dan', 'tan', 'thu',
]);

export function stripVietnamese(input = '') {
  let text = String(input).toLowerCase();
  for (const [pattern, replacement] of VIETNAMESE_MAP) text = text.replace(pattern, replacement);
  return text;
}

function collapseElongatedCharacters(text) {
  // "laaaag", "loiiii" -> "lag", "loi". Giữ tối đa 1 ký tự lặp vì tiếng Việt
  // sau khi bỏ dấu hiếm khi cần ký tự đôi để phân biệt intent hỗ trợ.
  return text.replace(/([a-z0-9])\1{2,}/g, '$1');
}

export function levenshteinDistance(a = '', b = '', maxDistance = Infinity) {
  const left = String(a);
  const right = String(b);
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;

  const rows = [Array.from({ length: right.length + 1 }, (_, index) => index)];
  for (let i = 1; i <= left.length; i += 1) {
    const previous = rows[i - 1];
    const current = [i];
    let rowMin = current[0];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      let value = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        value = Math.min(value, rows[i - 2][j - 2] + 1);
      }
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    rows.push(current);
  }
  return rows[left.length][right.length];
}

function fuzzyCorrectToken(token) {
  if (token.length < 4 || /^\d+$/.test(token) || DOMAIN_VOCAB.has(token)) return token;
  const maxDistance = token.length >= 8 ? 2 : 1;
  let best = token;
  let bestDistance = maxDistance + 1;

  for (const candidate of DOMAIN_VOCAB) {
    if (Math.abs(candidate.length - token.length) > maxDistance) continue;
    if (candidate[0] !== token[0]) continue;
    const distance = levenshteinDistance(token, candidate, maxDistance);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      if (distance === 1) break;
    }
  }
  return bestDistance <= maxDistance ? best : token;
}

export function normalizeText(input = '', { fuzzy = true } = {}) {
  let text = collapseElongatedCharacters(stripVietnamese(input))
    .replace(/<@!?\d+>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let words = text.split(' ').filter(Boolean).flatMap((word) => {
    const replacement = TOKEN_ALIASES.get(word) || word;
    return String(replacement).split(' ');
  });
  if (fuzzy) words = words.map(fuzzyCorrectToken);
  text = words.join(' ');

  for (const [from, to] of PHRASE_ALIASES) {
    text = text.replace(new RegExp(`(?:^|\\s)${from.replace(/ /g, '\\s+')}(?=\\s|$)`, 'g'), (match) => {
      const leading = match.startsWith(' ') ? ' ' : '';
      return `${leading}${to}`;
    });
  }

  return text.replace(/\s+/g, ' ').trim();
}

export function tokenize(input = '', options = {}) {
  return normalizeText(input, options).split(' ').filter((token) => token.length > 1);
}

export function ngrams(input = '', size = 2) {
  const tokens = tokenize(input);
  const result = [];
  for (let index = 0; index <= tokens.length - size; index += 1) {
    result.push(tokens.slice(index, index + size).join(' '));
  }
  return result;
}

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function compactText(input = '', max = 1500) {
  return String(input)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, Math.max(1, Number(max) || 1500));
}

export function hasPromptInjectionSignals(input = '') {
  const text = normalizeText(input, { fuzzy: false });
  return [
    'bo qua huong dan', 'bo qua quy tac', 'ignore previous', 'ignore instructions',
    'system prompt', 'developer message', 'tiet lo prompt', 'hien prompt',
    'tu tao command', 'chay lenh console', 'cap quyen admin',
  ].some((phrase) => text.includes(phrase));
}
