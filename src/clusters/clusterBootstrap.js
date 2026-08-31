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

function optionSupportsCluster(option, key) {
  const scope = String(option?.clusterKeys || '*').split(',').map((item) => item.trim()).filter(Boolean);
  return !scope.length || scope.includes('*') || scope.includes(key);
}

export async function ensureDefaultClusters(prisma) {
  const rows = await prisma.cluster.findMany({ select: { key: true, defaultOptionId: true } });
  const existing = new Set(rows.map((item) => item.key));
  const defaultOptions = await prisma.option.findMany({
    where: { isActive: true, name: 'Hỗ Trợ Chung' },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, clusterKeys: true },
  });
  const defaultOptionFor = (key) => defaultOptions.find((option) => optionSupportsCluster(option, key)) || null;
  let created = 0;
  for (const cluster of DEFAULT_CLUSTERS) {
    if (existing.has(cluster.key)) continue;
    await prisma.cluster.create({ data: { ...createData(cluster), defaultOptionId: defaultOptionFor(cluster.key)?.id || null } });
    created += 1;
  }
  for (const cluster of rows.filter((item) => !item.defaultOptionId)) {
    const option = defaultOptionFor(cluster.key);
    if (option) await prisma.cluster.update({ where: { key: cluster.key }, data: { defaultOptionId: option.id } });
  }
  return { total: DEFAULT_CLUSTERS.length, created };
}
