import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

test('real level and rank slash/prefix commands load profiles from an isolated API fixture', { timeout: 15000 }, async (t) => {
  const requests = [];
  const userId = '123456789012345678';
  const profile = { userId, level: 3, experience: 75, experienceForNextLevel: 175, totalExperience: 450 };
  const server = createServer((req, res) => {
    requests.push({ path: req.url, secret: req.headers['x-bot-secret'] });
    res.setHeader('content-type', 'application/json');
    let data;
    if (req.url === '/api/config') data = { chatLevelConfig: { enabled: true, imageEnabled: false, accentColor: '#18BFA5' } };
    else if (req.url === `/api/chat-levels/profiles/${userId}`) data = profile;
    else if (req.url.startsWith('/api/chat-levels/leaderboard')) data = [profile];
    else { res.statusCode = 404; res.end(JSON.stringify({ success: false })); return; }
    res.end(JSON.stringify({ success: true, data }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  const program = `
    import assert from 'node:assert/strict';
    const level = await import('./src/bot/commands/level.js');
    const rank = await import('./src/bot/commands/rank.js');
    const leaderboard = await import('./src/bot/commands/leaderboard.js');
    const user = { id: '${userId}', username: 'Người thử nghiệm', displayAvatarURL: () => undefined };
    const replies = []; let deferred = 0;
    const message = { author: user, mentions: { users: { first: () => undefined } }, guild: { name: 'IS7MC' }, reply: async (body) => replies.push(body) };
    const interaction = { user, guild: message.guild, options: { getSubcommandGroup: () => null, getSubcommand: () => 'me', getUser: () => null, getInteger: () => 10 }, deferReply: async () => { deferred++; }, editReply: async (body) => replies.push(body) };
    await level.executePrefix(message);
    await level.execute(interaction);
    await rank.executePrefix(message);
    await rank.execute(interaction);
    await leaderboard.executePrefix(message);
    await leaderboard.execute(interaction);
    assert.equal(replies.length, 6); assert.equal(deferred, 3);
    for (const payload of replies) { assert.equal(payload.files, undefined); assert.equal(payload.embeds.length, 1); assert.deepEqual(payload.allowedMentions, { parse: [], repliedUser: false }); }
    for (const payload of replies.slice(0, 4)) { const embed = payload.embeds[0].toJSON(); assert.equal(embed.color, 0x18BFA5); assert.match(embed.description, /Level \\*\\*3\\*\\*/); }
    assert.equal(replies[2].embeds[0].toJSON().fields.find(field => field.name === 'Xếp hạng').value, '#1');
    const { clearConfigCache } = await import('./src/bot/utils/api.js');
    clearConfigCache();
    let acknowledge; let denied;
    const pendingAdmin = level.execute({ ...interaction, member: {}, options: { getSubcommandGroup: () => 'admin' },
      deferReply: (options) => { assert.equal(options.flags, 64); return new Promise(resolve => { acknowledge = resolve; }); },
      editReply: async (body) => { denied = body; }, reply: () => { throw new Error('already acknowledged'); } });
    assert.equal(typeof acknowledge, 'function', 'admin acknowledgement precedes config fetch');
    acknowledge(); await pendingAdmin;
    assert.match(denied, /Administrator/);
    console.log('LEVEL_COMMAND_FIXTURE_OK');
  `;
  const { stdout } = await run(process.execPath, ['--input-type=module', '--eval', program], {
    cwd: new URL('../', import.meta.url), timeout: 12000, windowsHide: true,
    env: { ...process.env, API_URL: `http://127.0.0.1:${server.address().port}`, BOT_API_SECRET: 'local-test-only', DATABASE_URL: 'file::memory:', NODE_ENV: 'test', HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', NO_PROXY: '127.0.0.1' },
  });
  assert.match(stdout, /LEVEL_COMMAND_FIXTURE_OK/);
  assert.equal(requests.filter((request) => request.path.startsWith('/api/chat-levels/profiles/')).length, 4);
  assert.ok(requests.every((request) => request.secret === 'local-test-only'));
});

test('real level and rank slash/prefix PNGs retain their individual Discord guild names', { timeout: 20000 }, async (t) => {
  const userId = '123456789012345678';
  const profile = { userId, level: 3, experience: 75, experienceForNextLevel: 175, totalExperience: 450 };
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    res.setHeader('content-type', 'application/json');
    let data;
    if (req.url === '/api/config') data = { chatLevelConfig: { enabled: true, imageEnabled: true, accentColor: '#18BFA5' } };
    else if (req.url === `/api/chat-levels/profiles/${userId}`) data = profile;
    else if (req.url.startsWith('/api/chat-levels/leaderboard')) data = [profile];
    else { res.statusCode = 404; res.end(JSON.stringify({ success: false })); return; }
    res.end(JSON.stringify({ success: true, data }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  const program = `
    import assert from 'node:assert/strict';
    import * as level from './src/bot/commands/level.js';
    import * as rank from './src/bot/commands/rank.js';
    import { rankCardSvg, renderCardWorker } from './src/bot/utils/rank-card.js';
    const user = { id: '${userId}', username: 'Đặng Minh', displayAvatarURL: () => undefined };
    const profile = ${JSON.stringify(profile)};
    const cases = [['level', true, 'IS7MC'], ['level', false, 'Máy chủ Mây Xanh'], ['rank', true, 'Realm <A> & B'], ['rank', false, 'Server Sao Việt']];
    for (const [kind, prefix, guildName] of cases) {
      let payload;
      const command = kind === 'level' ? level : rank;
      const message = { author: user, guild: { name: guildName }, mentions: { users: { first: () => undefined } }, reply: async (body) => { payload = body; } };
      if (prefix) await command.executePrefix(message);
      else await command.execute({ user, guild: message.guild,
        options: { getSubcommandGroup: () => null, getSubcommand: () => 'me', getUser: () => null },
        deferReply: async () => {}, editReply: async (body) => { payload = body; } });
      const expected = await renderCardWorker(rankCardSvg({ username: user.username, guildName, profile, accentColor: '#18BFA5', position: kind === 'rank' ? 1 : undefined }));
      assert.deepEqual(payload.files?.[0].attachment, expected, kind + (prefix ? ' prefix' : ' slash') + ' must forward the actual guild name');
    }
    console.log('LEVEL_GUILD_PNG_FIXTURE_OK');
  `;
  const { stdout } = await run(process.execPath, ['--input-type=module', '--eval', program], {
    cwd: new URL('../', import.meta.url), timeout: 17000, windowsHide: true,
    env: { ...process.env, API_URL: `http://127.0.0.1:${server.address().port}`, BOT_API_SECRET: 'local-test-only', DATABASE_URL: 'file::memory:', NODE_ENV: 'test', HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', NO_PROXY: '127.0.0.1' },
  });
  assert.match(stdout, /LEVEL_GUILD_PNG_FIXTURE_OK/);
  assert.equal(requests.filter((path) => path.startsWith('/api/chat-levels/profiles/')).length, 4);
});
