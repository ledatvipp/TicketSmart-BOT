import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { createEventHandler, loadCommandModules, logRuntimeError } from '../src/bot/utils/runtime.js';
import logger from '../src/bot/utils/logger.js';

let importNumber = 0;

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function json(response, value, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
}

async function localApi(t, handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const previousUrl = process.env.API_URL;
  process.env.API_URL = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    if (previousUrl === undefined) delete process.env.API_URL;
    else process.env.API_URL = previousUrl;
  });
  return import(new URL(`../src/bot/utils/api.js?runtime-test=${++importNumber}`, import.meta.url));
}

async function moduleDirectory(t, files) {
  const directory = await mkdtemp(join(tmpdir(), 'bot-runtime-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'package.json'), '{"type":"module"}');
  for (const [name, source] of Object.entries(files)) await writeFile(join(directory, name), source);
  return directory;
}

function commandSource(name) {
  return `export const data = {name: ${JSON.stringify(name)}, toJSON() { return {name: this.name}; }}; export function execute() { return 'executed'; }`;
}

async function runFixture(args, options = {}, onOutput = () => {}) {
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
  let output = '';
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; child.kill(); }, 5_000);
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => {
    output += chunk;
    onOutput(output, child);
  });
  try {
    const [code, signal] = await once(child, 'close');
    assert.equal(timedOut, false, `Fixture did not exit in time: ${output}`);
    return { code, signal, output };
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

test('command loading publishes all valid modules and ignores unrelated files', async (t) => {
  const directory = await moduleDirectory(t, {
    'a.js': commandSource('rank'),
    'b.js': commandSource('level'),
    'README.md': 'not a command',
  });
  const commands = await loadCommandModules(directory);
  assert.deepEqual([...commands.keys()], ['rank', 'level']);
  assert.equal(commands.get('rank').execute(), 'executed');
});

test('command import failure leaves the published collection untouched', async (t) => {
  const directory = await moduleDirectory(t, {
    'a.js': commandSource('rank'),
    'b.js': "throw new Error('fixture import failed');",
  });
  const existing = new Map([['existing', {}]]);
  let published = existing;
  await assert.rejects(async () => { published = await loadCommandModules(directory); }, /fixture import failed/);
  assert.equal(published, existing);
  assert.deepEqual([...published.keys()], ['existing']);
});

test('malformed, duplicate and unserializable commands fail startup', async (t) => {
  for (const [name, source, pattern] of [
    ['invalid', "export const data = {name: 'invalid'}; export const execute = true;", /thiếu/],
    ['duplicate', commandSource('rank'), /trùng/],
    ['serialization', "export const data = {name: 'invalid', toJSON() { throw new Error('invalid schema'); }}; export function execute() {}", /invalid schema/],
  ]) {
    await t.test(name, async (subtest) => {
      const directory = await moduleDirectory(subtest, { 'a.js': commandSource('rank'), 'b.js': source });
      await assert.rejects(loadCommandModules(directory), pattern);
    });
  }
});

test('event boundary contains sync throws, rejected promises and non-Error reasons', async () => {
  const errors = [];
  const debug = [];
  const log = { error: (...args) => errors.push(args), debug: (stack) => debug.push(stack) };
  const emitter = new EventEmitter();
  let received;
  emitter.on('success', createEventHandler({ name: 'success', execute: (...args) => { received = args; } }, log));
  emitter.emit('success', 1, 'two');
  assert.deepEqual(received, [1, 'two']);
  for (const reason of [new Error('sync failure'), null, undefined, 'string failure', { reason: 'object failure' }]) {
    const event = { name: 'fixture', execute() { throw reason; } };
    await createEventHandler(event, log)();
    await createEventHandler({ ...event, execute: () => Promise.reject(reason) }, log)();
    assert.doesNotThrow(() => logRuntimeError(log, 'process rejection', reason));
  }
  assert.equal(errors.length, 15);
  assert.equal(debug.length, 3);
  assert.match(errors[0][0], /fixture/);
  assert.equal(errors.at(-1)[1], 'Non-Error rejection');
});

test('config readers and explicit loads share one request and preserve the envelope', async (t) => {
  let requests = 0;
  const requested = deferred();
  let response;
  const api = await localApi(t, (_request, res) => { requests++; response = res; requested.resolve(); });
  const envelope = { success: true, data: { staffRoleId: 'fixture-role' } };
  const reads = Array.from({ length: 20 }, (_, index) => index % 2 ? api.getConfig() : api.loadConfig());
  await requested.promise;
  json(response, envelope);
  assert.deepEqual(await Promise.all(reads), Array(20).fill(envelope));
  assert.deepEqual(await api.getConfig(), envelope);
  assert.equal(requests, 1);
});

test('cold config failures back off, deduplicate errors and recover after retry delay', async (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  let requests = 0;
  let failing = true;
  const logs = [];
  t.mock.method(logger, 'error', (...args) => logs.push(args));
  const api = await localApi(t, (_request, response) => {
    requests++;
    json(response, failing ? { success: false } : { success: true, data: { recovered: true } }, failing ? 503 : 200);
  });
  let results = await Promise.allSettled(Array.from({ length: 10 }, () => api.getConfig()));
  assert.ok(results.every((result) => result.status === 'rejected'));
  results = await Promise.allSettled([api.getConfig(), api.loadConfig()]);
  assert.ok(results.every((result) => result.status === 'rejected'));
  assert.equal(requests, 1);
  assert.equal(logs.length, 1);
  now += 5_001;
  failing = false;
  assert.deepEqual(await api.getConfig(), { success: true, data: { recovered: true } });
  assert.equal(requests, 2);
});

test('stale config survives an outage without a per-message refresh storm', async (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  t.mock.method(logger, 'error', () => {});
  const warnings = [];
  t.mock.method(logger, 'warn', (...args) => warnings.push(args));
  let requests = 0;
  let failing = false;
  const envelope = { success: true, data: { version: 1 } };
  const api = await localApi(t, (_request, response) => {
    requests++;
    json(response, failing ? { success: false } : envelope, failing ? 503 : 200);
  });
  await api.getConfig();
  now += 5 * 60_000 + 1;
  failing = true;
  assert.deepEqual(await Promise.all(Array.from({ length: 10 }, () => api.getConfig())), Array(10).fill(envelope));
  for (let index = 0; index < 10; index++) assert.deepEqual(await api.getConfig(), envelope);
  assert.equal(requests, 2);
  assert.equal(warnings.length, 1);
  now += 5_001;
  failing = false;
  envelope.data.version = 2;
  assert.deepEqual(await api.getConfig(), envelope);
  assert.equal(requests, 3);
});

test('invalidation prevents old in-flight success or failure from replacing current config', async (t) => {
  for (const oldFails of [false, true]) {
    for (const oldFinishesFirst of [false, true]) {
      await t.test(`old failure=${oldFails}, finishes first=${oldFinishesFirst}`, async (subtest) => {
        const responses = [];
        const first = deferred();
        const second = deferred();
        const api = await localApi(subtest, (_request, response) => {
          responses.push(response);
          (responses.length === 1 ? first : second).resolve();
        });
        const previous = api.loadConfig();
        await first.promise;
        api.clearConfigCache();
        const current = api.getConfig();
        await second.promise;
        const stale = { success: true, data: { version: 'stale' } };
        const fresh = { success: true, data: { version: 'fresh' } };
        if (oldFinishesFirst) {
          json(responses[0], stale, oldFails ? 503 : 200);
          await new Promise((resolve) => setImmediate(resolve));
          json(responses[1], fresh);
        } else {
          json(responses[1], fresh);
          await current;
          json(responses[0], stale, oldFails ? 503 : 200);
        }
        assert.deepEqual(await previous, fresh);
        assert.deepEqual(await current, fresh);
        assert.deepEqual(await api.getConfig(), fresh);
        assert.equal(responses.length, 2);
      });
    }
  }
});

test('explicit invalidation clears failure backoff and allows an immediate fresh load', async (t) => {
  t.mock.method(logger, 'error', () => {});
  let requests = 0;
  const api = await localApi(t, (_request, response) => {
    requests++;
    json(response, { success: requests > 1, data: { recovered: true } }, requests === 1 ? 503 : 200);
  });
  await assert.rejects(api.getConfig());
  api.clearConfigCache();
  assert.equal((await api.getConfig()).data.recovered, true);
  assert.equal(requests, 2);
});

test('auto-actions executes enveloped actions, reports API errors and releases its running guard', async (t) => {
  const sent = [];
  const warnings = [];
  const completed = deferred();
  let requests = 0;
  t.mock.method(logger, 'warn', (...args) => warnings.push(args));
  t.mock.method(logger, 'info', () => {});
  await localApi(t, (request, response) => {
    if (request.url === '/api/config') return json(response, { success: true, data: { staffRoleId: 'staff-fixture' } });
    requests++;
    if (requests === 1) return json(response, { success: false }, 503);
    if (requests === 2) return json(response, { actions: [] });
    return json(response, { success: true, data: { actions: [{ kind: 'auto-escalate', channelId: 'ticket', waitMinutes: 10 }] } });
  });
  const { startScheduler, stopScheduler } = await import('../src/bot/jobs/autoActions.js');
  t.after(stopScheduler);
  const channel = { async send(payload) { sent.push(payload); stopScheduler(); completed.resolve(); } };
  const client = { guilds: { cache: { first: () => ({ channels: { cache: new Map([['ticket', channel]]) } }) } } };
  startScheduler(client, 20);
  const timeout = setTimeout(() => completed.resolve(), 3_000);
  try { await completed.promise; } finally { clearTimeout(timeout); }
  assert.equal(sent.length, 1);
  assert.equal(sent[0].content, '<@&staff-fixture>');
  assert.match(sent[0].embeds[0].data.title, /Auto-Escalated/);
  assert.equal(requests, 3);
  assert.equal(warnings.length, 2);
  assert.ok(warnings.every((args) => args[0].includes('tick lỗi')));
});

test('stopping the scheduler cancels the delayed initial tick and does not keep a process alive', async () => {
  const moduleUrl = new URL('../src/bot/jobs/autoActions.js', import.meta.url).href;
  const result = await runFixture(['--input-type=module', '--eval', `
    const { startScheduler, stopScheduler } = await import(${JSON.stringify(moduleUrl)});
    startScheduler({}, 60000);
    stopScheduler();
  `]);
  assert.equal(result.code, 0, result.output);
});

async function supervisorDirectory(t) {
  const directory = await moduleDirectory(t, {});
  const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
  const require = createRequire(import.meta.url);
  const dotenvUrl = pathToFileURL(require.resolve('dotenv/config')).href;
  await writeFile(join(directory, 'index.js'), source.replace("import 'dotenv/config';", `import ${JSON.stringify(dotenvUrl)};`));
  for (const name of ['api', 'bot']) {
    await mkdir(join(directory, 'src', name), { recursive: true });
    await writeFile(join(directory, 'src', name, 'index.js'), 'process.exit(1);');
  }
  return directory;
}

test('supervisor stays alive after both children exit and enforces the restart limit', async (t) => {
  const directory = await supervisorDirectory(t);
  const result = await runFixture([join(directory, 'index.js')], {
    cwd: directory,
    env: { ...process.env, PROCESS_RESTART_LIMIT: '1', DOTENV_CONFIG_PATH: join(directory, 'absent.env') },
  });
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /quá 1 lần/);
  assert.match(result.output, /restart_limit/);
});

test('intentional shutdown cancels pending supervisor restarts', async (t) => {
  const directory = await supervisorDirectory(t);
  const entrypoint = join(directory, 'index.js');
  const source = await readFile(entrypoint, 'utf8');
  // Emit through the real signal handler, including on Windows where kill is forced.
  await writeFile(entrypoint, `${source}\nprocess.stdin.once('data', () => process.emit('SIGTERM'));\n`);
  let stopping = false;
  const result = await runFixture([entrypoint], {
    cwd: directory,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PROCESS_RESTART_LIMIT: '1', DOTENV_CONFIG_PATH: join(directory, 'absent.env') },
  }, (output, child) => {
    if (!stopping && (output.match(/sẽ tự khởi động lại/g) || []).length === 2) {
      stopping = true;
      child.stdin.end('stop');
    }
  });
  assert.equal(stopping, true, result.output);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /SIGTERM/);
  assert.doesNotMatch(result.output, /restart_limit/);
  assert.equal((result.output.match(/đã dừng/g) || []).length, 2);
});
