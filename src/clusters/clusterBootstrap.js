import { DEFAULT_CLUSTERS } from './clusterCatalog.js';

function aliasesValue(cluster) {
  return Array.isArray(cluster.aliases) ? cluster.aliases.join(',') : String(cluster.aliases || '');
}

function createData(cluster) {
  return {
    key: cluster.key,
    name: cluster.name,
    emoji: cluster.emoji,
    color: cluster.color,
    aliases: aliasesValue(cluster),
    description: cluster.description,
    supportChannelIds: '',
    staffRoleIds: '',
    sortOrder: cluster.sortOrder,
    isActive: true,
  };
}

export async function ensureDefaultClusters(prisma) {
  const existing = new Set((await prisma.cluster.findMany({ select: { key: true } })).map((item) => item.key));
  let created = 0;
  for (const cluster of DEFAULT_CLUSTERS) {
    if (existing.has(cluster.key)) continue;
    await prisma.cluster.create({ data: createData(cluster) });
    created += 1;
  }
  return { total: DEFAULT_CLUSTERS.length, created };
}
