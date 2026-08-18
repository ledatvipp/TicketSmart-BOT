import { normalizeText } from '../intelligence/text.js';

export const DEFAULT_CLUSTERS = Object.freeze([
  {
    key: 'smp', name: 'SMP', emoji: '🌿', color: '#57F287', sortOrder: 10,
    aliases: ['smp', 'smp thuong', 'sinh ton smp'],
    description: 'Cụm SMP cộng đồng và sinh tồn cơ bản.',
    aiContext: 'Ưu tiên hướng dẫn sinh tồn cộng đồng, claim, home, trade và hoạt động SMP. Không áp dụng cơ chế đảo Skyblock hay cấp Tu Tiên.',
  },
  {
    key: 'survival', name: 'Survival', emoji: '🏕️', color: '#FEE75C', sortOrder: 20,
    aliases: ['survival', 'survival chill', 'sinh ton', 'sv survival'],
    description: 'Cụm Survival với hệ thống câu cá, dungeon, trade và nông trại.',
    aiContext: 'Ưu tiên dữ liệu Survival: claim, fishing, dungeon, trade, farm, rank và lịch sự kiện của Survival. Không lấy hướng dẫn Skyblock hoặc BoxPvP.',
  },
  {
    key: 'skyblock', name: 'Skyblock', emoji: '☁️', color: '#5DADE2', sortOrder: 30,
    aliases: ['skyblock', 'sky block', 'dao sky', 'island', 'dao cua toi'],
    description: 'Cụm đảo Skyblock, nhiệm vụ đảo và kinh tế riêng.',
    aiContext: 'Ưu tiên đảo, island, thành viên đảo, nâng cấp đảo, generator, minion và kinh tế Skyblock. Không bịa lệnh nếu Knowledge Base chưa có.',
  },
  {
    key: 'boxpvp', name: 'BoxPvP', emoji: '📦', color: '#ED4245', sortOrder: 40,
    aliases: ['boxpvp', 'box pvp', 'box', 'mine box', 'khu box'],
    description: 'Cụm BoxPvP tập trung khai thác, trang bị và giao tranh.',
    aiContext: 'Ưu tiên khu mine/box, nâng cấp trang bị, PvP, combat tag, reset mine và phần thưởng BoxPvP. Không đưa hướng dẫn claim sinh tồn.',
  },
  {
    key: 'tu-tien', name: 'Tu Tiên', emoji: '🪷', color: '#AF7AC5', sortOrder: 50,
    aliases: ['tu tien', 'tutien', 'tu tiên', 'canh gioi', 'linh khi', 'dot pha'],
    description: 'Cụm Tu Tiên với cảnh giới, kỹ năng và tiến trình riêng.',
    aiContext: 'Ưu tiên cảnh giới, tu luyện, linh khí, đột phá, kỹ năng, bí cảnh và vật phẩm Tu Tiên. Không áp dụng rank/tiến trình của Survival nếu không có nguồn.',
  },
  {
    key: 'ffa', name: 'FFA', emoji: '⚔️', color: '#E67E22', sortOrder: 60,
    aliases: ['ffa', 'free for all', 'arena ffa', 'dau truong ffa'],
    description: 'Cụm đấu trường FFA và kit PvP.',
    aiContext: 'Ưu tiên arena, kit, respawn, combat, leaderboard và quy định PvP FFA. Không hướng dẫn claim, đảo hoặc farm.',
  },
  {
    key: 'chunkysmp', name: 'ChunkySMP', emoji: '🧊', color: '#1ABC9C', sortOrder: 70,
    aliases: ['chunkysmp', 'chunky smp', 'chunky', 'chunk smp', 'smp chunky'],
    description: 'Cụm ChunkySMP với thế giới chia chunk và cộng đồng riêng.',
    aiContext: 'Ưu tiên chunk, khu vực cộng đồng, bảo vệ đất và cơ chế riêng của ChunkySMP. Không đánh đồng với SMP thường khi người dùng nói rõ ChunkySMP.',
  },
]);

const BY_KEY = new Map(DEFAULT_CLUSTERS.map((cluster) => [cluster.key, cluster]));
const GLOBAL_INTENTS = new Set([
  'STAFF_APPLICATION', 'STAFF_REQUIREMENTS', 'TOPUP_GUIDE', 'TOPUP_NOT_RECEIVED',
  'PAYMENT_ERROR', 'PURCHASE_RANK', 'DONATION_INFO', 'BAN_APPEAL', 'MUTE_APPEAL',
  'ACCOUNT_LINK', 'RULES_GUIDE', 'SERVER_STATUS', 'SERVER_OFFLINE', 'UNKNOWN_SUPPORT',
]);

export function parseClusterMap(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getDefaultCluster(key) {
  return BY_KEY.get(String(key || '').toLowerCase()) || null;
}

export function mergeClusters(items = []) {
  const database = new Map((Array.isArray(items) ? items : []).map((item) => [item.key, item]));
  return DEFAULT_CLUSTERS.map((fallback) => ({ ...fallback, ...(database.get(fallback.key) || {}) }))
    .concat((Array.isArray(items) ? items : []).filter((item) => !BY_KEY.has(item.key)))
    .filter((item) => item.isActive !== false)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

function channelCluster(channelId, channelMap, clusters) {
  if (!channelId) return null;
  const map = parseClusterMap(channelMap);
  const direct = map[channelId];
  if (typeof direct === 'string') return clusters.find((item) => item.key === direct) || null;
  for (const cluster of clusters) {
    const ids = map[cluster.key];
    if (Array.isArray(ids) && ids.map(String).includes(String(channelId))) return cluster;
    const storedIds = String(cluster.supportChannelIds || '').split(',').map((id) => id.trim()).filter(Boolean);
    if (storedIds.includes(String(channelId))) return cluster;
  }
  return null;
}

export function detectCluster(text, {
  clusters = DEFAULT_CLUSTERS,
  channelId = null,
  channelMap = {},
  conversationClusterKey = null,
  defaultClusterKey = null,
} = {}) {
  const active = mergeClusters(clusters);
  const fromChannel = channelCluster(channelId, channelMap, active);
  if (fromChannel) return { cluster: fromChannel, source: 'channel', confidence: 1 };

  const normalized = normalizeText(text || '');
  let best = null;
  for (const cluster of active) {
    const aliases = [cluster.name, cluster.key, ...String(cluster.aliases || '').split(','), ...(Array.isArray(cluster.aliases) ? cluster.aliases : [])]
      .map((value) => normalizeText(value)).filter(Boolean).sort((a, b) => b.length - a.length);
    for (const alias of aliases) {
      if (!alias || alias.length < 2) continue;
      const exact = normalized === alias;
      const matched = exact || normalized.includes(alias);
      if (!matched) continue;
      const score = exact ? 1 : Math.min(0.98, 0.78 + Math.min(0.18, alias.length / 100));
      if (!best || score > best.confidence || (score === best.confidence && alias.length > best.alias.length)) {
        best = { cluster, source: 'message', confidence: score, alias };
      }
    }
  }
  if (best) return best;

  const fromConversation = active.find((item) => item.key === conversationClusterKey);
  if (fromConversation) return { cluster: fromConversation, source: 'conversation', confidence: 0.82 };
  const fallback = active.find((item) => item.key === defaultClusterKey);
  if (fallback) return { cluster: fallback, source: 'default', confidence: 0.55 };
  return { cluster: null, source: 'unknown', confidence: 0 };
}

export function intentNeedsCluster(intent) {
  const intents = Array.isArray(intent?.intents) && intent.intents.length ? intent.intents : [intent];
  return intents.some((item) => item?.key && !GLOBAL_INTENTS.has(item.key));
}

export function clusterColor(cluster, fallback = 0x5865f2) {
  const raw = String(cluster?.color || '').replace('#', '');
  return /^[0-9a-fA-F]{6}$/.test(raw) ? Number.parseInt(raw, 16) : fallback;
}

export function clusterLabel(cluster) {
  return cluster ? `${cluster.emoji || '🗺️'} ${cluster.name}` : '❔ Chưa chọn cụm';
}

export function articleMatchesCluster(article, clusterKey) {
  const scope = String(article?.clusterKeys || '*').split(',').map((item) => item.trim()).filter(Boolean);
  return scope.includes('*') || !clusterKey || scope.includes(clusterKey);
}

export function clusterPromptContext(cluster) {
  if (!cluster) return 'Chưa xác định cụm máy chủ. Không được đoán cơ chế riêng của bất kỳ cụm nào.';
  return `CỤM HIỆN TẠI: ${cluster.name} (${cluster.key}). ${cluster.aiContext || cluster.description || ''}`;
}
