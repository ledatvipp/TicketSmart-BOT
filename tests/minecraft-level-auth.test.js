import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { minecraftCanonicalRequest, requireMinecraftLevelSignature, resetMinecraftLevelReplayCache, sha256Hex } from '../src/api/middleware/minecraftLevelAuth.js';

function signedRequest({ body = '{"limit":1}', nonce = 'nonce-value-1234', timestamp = Math.floor(Date.now() / 1000).toString() } = {}) {
  const serverId = 'lobby-1';
  const contentSha256 = sha256Hex(body);
  const canonical = minecraftCanonicalRequest({ method: 'POST', path: '/api/chat-levels/minecraft/grants/claim', timestamp, nonce, contentSha256, serverId });
  const signature = crypto.createHmac('sha256', process.env.MINECRAFT_LEVEL_SERVICE_SECRETS ? JSON.parse(process.env.MINECRAFT_LEVEL_SERVICE_SECRETS)[serverId] : 'x'.repeat(32)).update(canonical).digest('base64url');
  return {
    method: 'POST', originalUrl: '/api/chat-levels/minecraft/grants/claim', rawBody: body, body: JSON.parse(body),
    minecraftLevelStatusDb: { minecraftLevelServiceStatus: { upsert: async ({ create }) => create } },
    headers: { 'x-ledat-server': serverId, 'x-ledat-timestamp': timestamp, 'x-ledat-nonce': nonce, 'x-ledat-content-sha256': contentSha256, 'x-ledat-signature': signature },
  };
}

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
}

test('LobbySign-compatible HMAC accepts one signed raw body and rejects replay or tampering', async () => {
  const original = process.env.MINECRAFT_LEVEL_SERVICE_SECRETS;
  process.env.MINECRAFT_LEVEL_SERVICE_SECRETS = JSON.stringify({ 'lobby-1': 'x'.repeat(32) });
  resetMinecraftLevelReplayCache();
  try {
    const req = signedRequest();
    const res = response();
    let called = false;
    await new Promise((resolve, reject) => requireMinecraftLevelSignature(req, res, (error) => {
      if (error) reject(error);
      else { called = true; resolve(); }
    }));
    assert.equal(called, true);
    requireMinecraftLevelSignature(req, res, () => {});
    assert.equal(res.statusCode, 409);

    resetMinecraftLevelReplayCache();
    const tampered = signedRequest();
    tampered.rawBody = '{"limit":2}';
    const bad = response();
    requireMinecraftLevelSignature(tampered, bad, () => {});
    assert.equal(bad.statusCode, 401);
    assert.equal(bad.payload.code, 'MINECRAFT_BODY_HASH_INVALID');
  } finally {
    if (original === undefined) delete process.env.MINECRAFT_LEVEL_SERVICE_SECRETS;
    else process.env.MINECRAFT_LEVEL_SERVICE_SECRETS = original;
  }
});
