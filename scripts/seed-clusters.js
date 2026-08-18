import { PrismaClient } from '../src/generated/client/index.js';
import { ensureDefaultClusters } from '../src/clusters/clusterBootstrap.js';

const prisma = new PrismaClient();
try {
  const result = await ensureDefaultClusters(prisma);
  console.log(`✅ Clusters ready: ${result.total} mặc định • tạo mới ${result.created}`);
} finally {
  await prisma.$disconnect();
}
