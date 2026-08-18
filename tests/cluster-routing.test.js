import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CLUSTERS,
  articleMatchesCluster,
  detectCluster,
  intentNeedsCluster,
  mergeClusters,
} from '../src/clusters/clusterCatalog.js';
import { buildActionPlan } from '../src/actions/actionRegistry.js';

test('ChunkySMP không bị nhận nhầm thành SMP thường', () => {
  const result = detectCluster('tôi bị lỗi claim ở chunky smp', { clusters: DEFAULT_CLUSTERS });
  assert.equal(result.cluster?.key, 'chunkysmp');
  assert.equal(result.source, 'message');
});

test('router ưu tiên channel mapping trước nội dung mơ hồ', () => {
  const result = detectCluster('server bị lag', {
    clusters: DEFAULT_CLUSTERS,
    channelId: '123456789012345678',
    channelMap: { '123456789012345678': 'skyblock' },
  });
  assert.equal(result.cluster?.key, 'skyblock');
  assert.equal(result.confidence, 1);
});

test('intent toàn hệ thống không bắt member chọn cụm', () => {
  assert.equal(intentNeedsCluster({ key: 'TOPUP_GUIDE' }), false);
  assert.equal(intentNeedsCluster({ key: 'CLAIM_GUIDE' }), true);
});

test('Knowledge Base khóa đúng scope cụm', () => {
  assert.equal(articleMatchesCluster({ clusterKeys: 'survival' }, 'survival'), true);
  assert.equal(articleMatchesCluster({ clusterKeys: 'survival' }, 'skyblock'), false);
  assert.equal(articleMatchesCluster({ clusterKeys: '*' }, 'boxpvp'), true);
});

test('cluster database ghi đè default nhưng vẫn giữ đủ bảy cụm', () => {
  const merged = mergeClusters([{ key: 'survival', name: 'Survival Chill', isActive: true, sortOrder: 1 }]);
  assert.equal(merged.find((item) => item.key === 'survival')?.name, 'Survival Chill');
  assert.equal(merged.length, 7);
});

test('button tạo ticket mang cluster key xuyên suốt flow', () => {
  const plan = buildActionPlan({
    intent: { action: 'CREATE_TICKET', buttonLabel: 'Tạo ticket' },
    option: { id: 'opt1' },
    config: {}, guildId: 'guild1', userId: 'user1', detectionId: 'det1', clusterKey: 'boxpvp',
  });
  assert.equal(plan[0].customId, 'smart:ticket:opt1:user1:det1:boxpvp');
});
