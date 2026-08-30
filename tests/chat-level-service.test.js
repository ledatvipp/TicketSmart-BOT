import test from 'node:test';
import assert from 'node:assert/strict';
import {
  awardChatMessage,
  addChatExperience,
  contentSimilarity,
  experienceForNextLevel,
  leaseRewardGrants,
  completeRewardGrant,
  deferRewardGrant,
  buildChatLevelSetupStatus,
  normalizeChatLevelConfig,
  normalizeChatContent,
} from '../src/services/chatLevelService.js';

const GUILD = '123456789012345678';
const USER = '223456789012345678';
const ROLE = '1543196526946291783';

function inValues(value, values) { return values.includes(value); }

function createAwardDb() {
  const messages = new Map();
  const profiles = new Map();
  const key = (guildId, userId) => `${guildId}:${userId}`;
  const db = {
    $transaction: (fn) => fn(db),
    chatLevelMessage: {
      findUnique: async ({ where }) => messages.get(`${where.guildId_messageId.guildId}:${where.guildId_messageId.messageId}`) || null,
      findMany: async ({ where, take }) => [...messages.values()].filter((row) => row.guildId === where.guildId && row.userId === where.userId && (where.awardedExperience?.gt === undefined || row.awardedExperience > where.awardedExperience.gt)).sort((a, b) => b.createdAt - a.createdAt).slice(0, take),
      create: async ({ data }) => { const row = { ...data }; messages.set(`${data.guildId}:${data.messageId}`, row); return row; },
      update: async ({ where, data }) => {
        const row = messages.get(`${where.guildId_messageId.guildId}:${where.guildId_messageId.messageId}`);
        if (!row) throw new Error('Chat level message not found');
        Object.assign(row, data);
        return row;
      },
    },
    chatLevelProfile: {
      findUnique: async ({ where }) => profiles.get(key(where.guildId_userId.guildId, where.guildId_userId.userId)) || null,
      create: async ({ data }) => { const row = { ...data, level: 0, experience: 0, totalExperience: 0, lastAwardedAt: null }; profiles.set(key(data.guildId, data.userId), row); return row; },
      upsert: async ({ where, create }) => {
        const existing = profiles.get(key(where.guildId_userId.guildId, where.guildId_userId.userId));
        if (existing) return existing;
        const row = { ...create, level: 0, experience: 0, totalExperience: 0, lastAwardedAt: null };
        profiles.set(key(create.guildId, create.userId), row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = profiles.get(key(where.guildId_userId.guildId, where.guildId_userId.userId));
        const increment = data.totalExperience?.increment || 0;
        const patch = { ...data };
        delete patch.totalExperience;
        Object.assign(row, patch, { totalExperience: row.totalExperience + increment });
        return row;
      },
    },
    chatLevelRewardGrant: {
      create: async ({ data }) => data,
      upsert: async ({ create }) => create,
    },
  };
  return db;
}

test('level formula and normalized config use documented defaults', () => {
  assert.equal(experienceForNextLevel(1), 100);
  assert.equal(experienceForNextLevel(4), 175);
  assert.equal(normalizeChatContent('  Xin CHÀO!!! https://example.com  '), 'xin chao');
  assert.equal(contentSimilarity('xin chao ban', 'ban xin chao'), 1);
  assert.deepEqual(normalizeChatLevelConfig({ enabled: true, requiredVerifiedRoleIds: [ROLE] }).requiredVerifiedRoleIds, [ROLE]);
});

test('anti-farm cooldown/similarity and message idempotency do not award twice', async () => {
  const db = createAwardDb();
  const config = normalizeChatLevelConfig({ enabled: true, allowedChannelIds: ['323456789012345678'], cooldownSeconds: 0, similarityWindow: 10, similarityThreshold: 0.9 });
  const base = { guildId: GUILD, userId: USER, channelId: '323456789012345678', memberRoleIds: [ROLE], content: 'Đây là một tin nhắn hữu ích hoàn toàn khác', config, db };
  const first = await awardChatMessage({ ...base, messageId: '423456789012345678', now: new Date('2026-01-01T00:00:00Z') });
  assert.equal(first.awarded, true);
  assert.equal(first.profile.totalExperience, 20);
  const duplicate = await awardChatMessage({ ...base, messageId: '423456789012345678', now: new Date('2026-01-01T00:01:00Z') });
  assert.equal(duplicate.reason, 'duplicate');
  const similar = await awardChatMessage({ ...base, messageId: '523456789012345678', content: 'hoàn toàn khác tin nhắn hữu ích đây là một', now: new Date('2026-01-01T00:01:00Z') });
  assert.equal(similar.reason, 'similar');
});

test('concurrent distinct messages for one profile preserve both XP awards', async () => {
  const db = createAwardDb();
  const config = normalizeChatLevelConfig({ enabled: true, allowedChannelIds: ['323456789012345678'], cooldownSeconds: 0, similarityThreshold: 0.9 });
  const base = { guildId: GUILD, userId: USER, channelId: '323456789012345678', memberRoleIds: [ROLE], config, db, now: new Date('2026-01-01T00:00:00Z') };
  const [first, second] = await Promise.all([
    awardChatMessage({ ...base, messageId: '623456789012345678', content: 'Những con mèo chạy qua công viên vào buổi sáng' }),
    awardChatMessage({ ...base, messageId: '723456789012345678', content: 'Trò chơi Minecraft hôm nay rất vui cùng bạn bè' }),
  ]);
  assert.equal(first.awarded, true);
  assert.equal(second.awarded, true);
  assert.equal(second.profile.totalExperience, 40);
});

test('admin EXP adjustment crosses levels through the same reward path', async () => {
  const db = createAwardDb();
  const config = normalizeChatLevelConfig({ enabled: true, rewardSpins: 3 });
  const result = await addChatExperience({ guildId: GUILD, userId: USER, experience: 100, config, db });
  assert.equal(result.profile.level, 1);
  assert.equal(result.profile.experience, 0);
  assert.equal(result.grants[0].spins, 3);
});

function createGrantDb() {
  const grants = [{ id: 'grant-1', guildId: GUILD, userId: USER, level: 1, spins: 1, minecraftServiceId: 'default', maxAttempts: 12, retryBaseSeconds: 60, status: 'PENDING', nextAttemptAt: new Date(0), attemptCount: 0, createdAt: new Date(0) }];
  const db = {
    $transaction: (fn) => fn(db),
    chatLevelRewardGrant: {
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const grant of grants) {
          if (where.id && grant.id !== where.id) continue;
          if (where.minecraftServiceId && grant.minecraftServiceId !== where.minecraftServiceId) continue;
          if (where.status && (typeof where.status === 'string' ? grant.status !== where.status : !inValues(grant.status, where.status.in))) continue;
          if (where.leaseToken && grant.leaseToken !== where.leaseToken) continue;
          if (where.nextAttemptAt?.lte && grant.nextAttemptAt > where.nextAttemptAt.lte) continue;
          if (where.leaseExpiresAt?.gt && (!grant.leaseExpiresAt || grant.leaseExpiresAt <= where.leaseExpiresAt.gt)) continue;
          if (where.leaseExpiresAt?.lte && (!grant.leaseExpiresAt || grant.leaseExpiresAt > where.leaseExpiresAt.lte)) continue;
          const increment = data.attemptCount?.increment || 0;
          const patch = { ...data };
          if (typeof data.attemptCount === 'number') grant.attemptCount = data.attemptCount;
          delete patch.attemptCount;
          Object.assign(grant, patch);
          if (increment) grant.attemptCount = (grant.attemptCount || 0) + increment;
          count += 1;
        }
        return { count };
      },
      findMany: async ({ where }) => grants.filter((grant) => {
        if (where.minecraftServiceId && grant.minecraftServiceId !== where.minecraftServiceId) return false;
        if (where.status && (typeof where.status === 'string' ? grant.status !== where.status : !inValues(grant.status, where.status.in))) return false;
        if (where.nextAttemptAt?.lte && grant.nextAttemptAt > where.nextAttemptAt.lte) return false;
        if (where.leaseExpiresAt?.lte && (!grant.leaseExpiresAt || grant.leaseExpiresAt > where.leaseExpiresAt.lte)) return false;
        return true;
      }).sort((a, b) => a.createdAt - b.createdAt),
      findFirst: async ({ where }) => grants.find((grant) => grant.id === where.id && grant.minecraftServiceId === where.minecraftServiceId && grant.status === where.status && grant.leaseToken === where.leaseToken && grant.leaseExpiresAt > where.leaseExpiresAt.gt) || null,
    },
  };
  return { db, grants };
}

test('reward grants are leased once and require the matching active lease to complete', async () => {
  const { db } = createGrantDb();
  const now = new Date('2026-01-01T00:00:00Z');
  const [grant] = await leaseRewardGrants({ db, now, limit: 5, leaseSeconds: 60 });
  assert.equal(grant.id, 'grant-1');
  assert.ok(grant.leaseToken);
  assert.equal((await leaseRewardGrants({ db, now, limit: 5 })).length, 0);
  assert.equal(await completeRewardGrant({ db, grantId: grant.id, leaseToken: 'wrong', now }), false);
  assert.equal(await completeRewardGrant({ db, grantId: grant.id, leaseToken: grant.leaseToken, now }), true);
});

test('reward grants only lease and complete for their assigned Minecraft service', async () => {
  const { db, grants } = createGrantDb();
  grants.push({ ...grants[0], id: 'grant-lobby', minecraftServiceId: 'lobby-1' });
  const now = new Date('2026-01-01T00:00:00Z');
  const [grant] = await leaseRewardGrants({ db, minecraftServiceId: 'lobby-1', now });
  assert.equal(grant.id, 'grant-lobby');
  assert.equal(await completeRewardGrant({ db, grantId: grant.id, leaseToken: grant.leaseToken, minecraftServiceId: 'default', now }), false);
  assert.equal(await completeRewardGrant({ db, grantId: grant.id, leaseToken: grant.leaseToken, minecraftServiceId: 'lobby-1', now }), true);
});

test('expired leases back off, dead-letter at the attempt limit, and manually restart', async () => {
  const { db, grants } = createGrantDb();
  const now = new Date('2026-01-01T00:00:00Z');
  grants[0] = { ...grants[0], status: 'LEASED', leaseToken: 'lease', leaseExpiresAt: new Date('2025-12-31T23:59:00Z'), attemptCount: 2, retryBaseSeconds: 60 };
  assert.equal((await leaseRewardGrants({ db, now })).length, 0);
  assert.equal(grants[0].status, 'DEFERRED');
  assert.equal(grants[0].nextAttemptAt.getTime(), now.getTime() + (120 * 1000));
  grants[0] = { ...grants[0], status: 'LEASED', leaseToken: 'lease-2', leaseExpiresAt: new Date('2025-12-31T23:59:00Z'), attemptCount: 3, maxAttempts: 3 };
  await leaseRewardGrants({ db, now });
  assert.equal(grants[0].status, 'FAILED');
  assert.match(grants[0].lastError, /3\/3/);
  const { retryRewardGrant } = await import('../src/services/chatLevelService.js');
  assert.equal(await retryRewardGrant(grants[0].id, db, now), true);
  assert.equal(grants[0].status, 'PENDING');
  assert.equal(grants[0].attemptCount, 0);
});

test('an explicitly deferred lease applies exponential backoff and can dead-letter', async () => {
  const { db, grants } = createGrantDb();
  const now = new Date('2026-01-01T00:00:00Z');
  grants[0] = { ...grants[0], status: 'LEASED', leaseToken: 'lease', leaseExpiresAt: new Date('2026-01-01T00:05:00Z'), attemptCount: 2, retryBaseSeconds: 60 };
  assert.equal(await deferRewardGrant({ db, grantId: grants[0].id, leaseToken: 'lease', now }), true);
  assert.equal(grants[0].nextAttemptAt.getTime(), now.getTime() + (120 * 1000));
  assert.equal(grants[0].status, 'DEFERRED');
});

test('replaying a message rejected for cooldown never earns XP later', async () => {
  const db = createAwardDb();
  const config = normalizeChatLevelConfig({ enabled: true, allowedChannelIds: ['323456789012345678'], cooldownSeconds: 60 });
  const base = { guildId: GUILD, userId: USER, channelId: '323456789012345678', memberRoleIds: [ROLE], config, db, content: 'Một tin nhắn đủ dài để được tính kinh nghiệm' };
  await awardChatMessage({ ...base, messageId: '823456789012345678', now: new Date('2026-01-01T00:00:00Z') });
  const rejected = await awardChatMessage({ ...base, messageId: '923456789012345678', now: new Date('2026-01-01T00:00:01Z') });
  assert.equal(rejected.reason, 'cooldown');
  const replay = await awardChatMessage({ ...base, messageId: '923456789012345678', now: new Date('2026-01-01T00:02:00Z') });
  assert.equal(replay.reason, 'duplicate');
  assert.equal((await db.chatLevelProfile.findUnique({ where: { guildId_userId: { guildId: GUILD, userId: USER } } })).totalExperience, 20);
});

test('setup status exposes non-secret remediation and counts', () => {
  const status = buildChatLevelSetupStatus({
    config: { enabled: true, allowedChannelIds: [], minecraftServiceId: 'lobby-1' },
    grants: [{ status: 'PENDING', _count: { status: 2 } }, { status: 'FAILED', _count: { status: 1 } }],
  });
  assert.equal(status.ready, false);
  assert.equal(status.minecraftServiceId, 'lobby-1');
  assert.equal(status.pendingCount, 2);
  assert.equal(status.failedCount, 1);
  assert.deepEqual(status.remediation, ['add_allowed_channel', 'connect_minecraft_service', 'retry_failed_rewards']);
});

test('premium config defaults and benign extensions survive serialization round-trip', async () => {
  const { parseChatLevelConfig, serializeChatLevelConfig } = await import('../src/services/chatLevelService.js');
  const defaults = normalizeChatLevelConfig({});
  assert.equal(defaults.imageEnabled, true);
  assert.equal(defaults.accentColor, '#5865F2');
  assert.equal(defaults.enabled, false);
  assert.deepEqual(defaults.allowedChannelIds, []);
  const extension = { label: 'Hành trình', panels: [{ heading: 'Cấp mới', enabled: true }] };
  const saved = parseChatLevelConfig(serializeChatLevelConfig({ imageEnabled: false, accentColor: '#a1b2c3', extension }));
  assert.equal(saved.imageEnabled, false);
  assert.equal(saved.accentColor, '#A1B2C3');
  assert.deepEqual(saved.extension, extension);
});

test('config rejects sensitive keys inside nested objects and arrays without echoing values', () => {
  for (const key of ['token', 'SIGNING_SECRET', 'password', 'api-key', 'api_key', 'apiKey', 'credentials',
    'privateKey', 'private_key', 'private-key', 'signingKey', 'signing_key', 'signing-key', 'encryptionKey', 'encryption_key', 'encryption-key']) {
    const marker = 'private-value-must-not-appear';
    const config = { extension: { sections: [{ settings: { [key]: marker } }] } };
    assert.throws(() => normalizeChatLevelConfig(config), (error) => {
      assert.equal(error.name, 'ValidationError');
      assert.ok(!error.message.includes(marker));
      return true;
    }, key);
    assert.throws(() => normalizeChatLevelConfig(JSON.stringify(config)), /không được chứa/);
  }
});

test('premium config rejects malformed accent colors and unsupported boolean values', () => {
  for (const accentColor of ['red', '#fff', '#1234567', '#GG1122', 'url(https://invalid.test)', 123, {}, []]) {
    assert.throws(() => normalizeChatLevelConfig({ accentColor }), /#RRGGBB/);
  }
  for (const imageEnabled of [{}, [], 'yes', 2]) {
    assert.throws(() => normalizeChatLevelConfig({ imageEnabled }), /boolean/);
  }
});
