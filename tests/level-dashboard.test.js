import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LEVEL_CONFIG,
  cloneLevelConfig,
  isLevelDraftDirty,
  parseDiscordIds,
  parseLevelConfig,
  readLevelConfigResponse,
  rewardState,
  validateLevelConfig,
} from '../src/web/src/utils/level-dashboard.js';

test('dashboard defaults include compatible image settings and empty channel eligibility', () => {
  const config = cloneLevelConfig();
  assert.equal(config.imageEnabled, true);
  assert.equal(config.accentColor, '#5865F2');
  assert.deepEqual(config.allowedChannelIds, []);
  assert.equal(config.similarityThreshold, 0.7);
  assert.equal(config.profanityXpMultiplier, 0.5);
  assert.deepEqual(validateLevelConfig(config), []);
  config.levelRoles.push({ minLevel: 10, roleId: '1543196526946291785' });
  assert.equal(DEFAULT_LEVEL_CONFIG.levelRoles.length, 0);
});

test('form and JSON round-trip preserves every supported field and benign extensions', () => {
  const source = {
    ...cloneLevelConfig(),
    enabled: true,
    allowedChannelIds: ['1543196526946291784'],
    levelRoles: [{ minLevel: 10, roleId: '1543196526946291785' }],
    rewardMilestones: [{ minLevel: 20, spins: 4 }],
    announcementChannelId: '1543196526946291784',
    imageEnabled: false,
    accentColor: '#aAbB22',
    integration: { key: 'benign-identifier', nested: ['future-field'] },
  };
  const draft = readLevelConfigResponse({ chatLevelConfig: JSON.stringify(source) });
  draft.xpPerMessage = 30;
  const jsonRoundTrip = parseLevelConfig(JSON.stringify(draft));
  assert.deepEqual(jsonRoundTrip, { ...source, xpPerMessage: 30 });
  assert.deepEqual(validateLevelConfig(jsonRoundTrip), []);
});

test('absent, invalid, or malformed config responses never produce savable defaults', () => {
  for (const response of [undefined, null, {}, { chatLevelConfig: null }, { chatLevelConfig: [] }, { chatLevelConfig: 'broken-json' }, { chatLevelConfig: 4 }]) {
    assert.throws(() => readLevelConfigResponse(response));
  }
  const legacy = readLevelConfigResponse({ chatLevelConfig: { enabled: true } });
  assert.equal(legacy.enabled, true);
  assert.equal(legacy.imageEnabled, true);
});

test('Discord ID entry supports multiline, comma and semicolon without losing string precision', () => {
  assert.deepEqual(parseDiscordIds('1543196526946291784\n1543196526946291785,1543196526946291784;1543196526946291786\n'), ['1543196526946291784', '1543196526946291785', '1543196526946291786']);
  assert.deepEqual(parseDiscordIds('   '), []);
  assert.deepEqual(parseDiscordIds('invalid-id'), ['invalid-id']);
  assert.match(validateLevelConfig({ ...cloneLevelConfig(), allowedChannelIds: parseDiscordIds('invalid-id') }).join(' '), /ID Discord/);
});

test('client validation blocks fractional counters, invalid presentation values and nested credentials', () => {
  for (const key of ['xpPerMessage', 'cooldownSeconds', 'minContentLength', 'similarityWindow', 'rewardSpins', 'maxRewardAttempts', 'rewardRetryBaseSeconds']) {
    assert.ok(validateLevelConfig({ ...cloneLevelConfig(), [key]: 1.5 }).length, key);
  }
  for (const accentColor of ['red', '#123', '#1234567', 'url(https://example.com)']) assert.ok(validateLevelConfig({ ...cloneLevelConfig(), accentColor }).length);
  assert.ok(validateLevelConfig({ ...cloneLevelConfig(), imageEnabled: 'true' }).length);
  assert.ok(validateLevelConfig({ ...cloneLevelConfig(), similarityThreshold: 0.71 }).length);
  assert.ok(validateLevelConfig({ ...cloneLevelConfig(), profanityXpMultiplier: 1 }).length);
  assert.ok(validateLevelConfig({ ...cloneLevelConfig(), profanityTerms: [''] }).length);
  assert.ok(validateLevelConfig({ ...cloneLevelConfig(), profanityTerms: ['!!!'] }).length);
  assert.ok(validateLevelConfig({ ...cloneLevelConfig(), profanityTerms: Array(101).fill('term') }).length);
  for (const key of ['token', 'apiKey', 'signingKey', 'private_key', 'encryption-key', 'password']) {
    assert.match(validateLevelConfig({ ...cloneLevelConfig(), extension: [{ [key]: 'diagnostic-placeholder' }] }).join(' '), /Không nhập token/);
  }
});

test('all reward states stay distinct and only deferred or failed records expose retry', () => {
  for (const status of ['PENDING', 'LEASED', 'DEFERRED', 'COMPLETED', 'FAILED']) {
    const result = rewardState({ status });
    assert.equal(result.raw, status);
    assert.equal(result.retryable, ['DEFERRED', 'FAILED'].includes(status));
  }
  assert.notEqual(rewardState({ status: 'PENDING' }).label, rewardState({ status: 'DEFERRED' }).label);
  assert.equal(rewardState({ status: 'error' }).retryable, false);
  assert.equal(rewardState({ grantStatus: 'FAILED' }).retryable, false);
});

test('dirty state compares with the saved baseline without coupling operational data', () => {
  const saved = cloneLevelConfig();
  const baseline = JSON.stringify(saved);
  const draft = cloneLevelConfig(saved);
  assert.equal(isLevelDraftDirty(draft, baseline), false);
  draft.xpPerMessage = 25;
  assert.equal(isLevelDraftDirty(draft, baseline), true);
  assert.equal(saved.xpPerMessage, 20);
  assert.equal(isLevelDraftDirty(draft, null), false);
});
