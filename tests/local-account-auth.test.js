import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/api/security/passwords.js';

test('local account passwords are salted and verified without storing plaintext', async () => {
  const password = 'test-password-123';
  const hash = await hashPassword(password);

  assert.match(hash, /^scrypt-v1\$[^$]+\$[^$]+$/);
  assert.notEqual(hash, password);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('wrong-password', hash), false);
  assert.equal(await verifyPassword(password, 'invalid-hash'), false);
});
