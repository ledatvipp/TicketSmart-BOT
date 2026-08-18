#!/usr/bin/env node
import { readdir, readFile, rm, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import crypto from 'crypto';
import { spawnSync } from 'child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const migrationsDir = join(root, 'prisma', 'migrations');
const SCALAR_TYPES = new Set(['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes']);

async function expectedSchema() {
  const schema = await readFile(join(root, 'prisma', 'schema.prisma'), 'utf8');
  const tables = [];
  const columns = {};
  for (const match of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const modelName = match[1];
    const body = match[2];
    const tableMap = /@@map\(\s*"([^"]+)"\s*\)/.exec(body)?.[1];
    const table = tableMap || modelName;
    tables.push(table);
    columns[table] = [];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.replace(/\/\/.*$/, '').trim();
      if (!line || line.startsWith('@@')) continue;
      const field = /^(\w+)\s+(\w+)(\? |\?|\[\])?/.exec(`${line} `);
      if (!field || !SCALAR_TYPES.has(field[2]) || field[3]?.trim() === '[]') continue;
      const columnMap = /@map\(\s*"([^"]+)"\s*\)/.exec(line)?.[1];
      columns[table].push(columnMap || field[1]);
    }
  }
  return { tables, columns };
}

async function migrationFiles() {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(migrationsDir, entry.name, 'migration.sql');
    files.push({ name: entry.name, path, sql: await readFile(path, 'utf8') });
  }
  return files;
}

async function runWithNodeSqlite(files, databasePath, expected) {
  let sqlite;
  try { sqlite = await import('node:sqlite'); }
  catch { return false; }
  const db = new sqlite.DatabaseSync(databasePath);
  try {
    db.exec('PRAGMA foreign_keys = ON;');
    for (const file of files) {
      db.exec(file.sql);
      console.log(`PASS ${file.name}`);
    }
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name);
    const missing = expected.tables.filter((name) => !tables.includes(name));
    if (missing.length) throw new Error(`Thiếu bảng sau migrate: ${missing.join(', ')}`);
    for (const [table, columns] of Object.entries(expected.columns)) {
      const actual = new Set(db.prepare(`PRAGMA table_info(\"${table}\")`).all().map((row) => row.name));
      const absent = columns.filter((name) => !actual.has(name));
      if (absent.length) throw new Error(`${table} thiếu cột: ${absent.join(', ')}`);
    }
    const violations = db.prepare('PRAGMA foreign_key_check').all();
    if (violations.length) throw new Error(`Foreign-key violations: ${JSON.stringify(violations.slice(0, 5))}`);
    console.log(`TABLES ${tables.length} EXPECTED ${expected.tables.length} MISSING []`);
    console.log('FK_CHECK []');
    return true;
  } finally {
    db.close();
  }
}

function runWithPython(files, databasePath, expected) {
  const payload = JSON.stringify({ databasePath, files, expectedTables: expected.tables, expectedColumns: expected.columns });
  const source = String.raw`
import json, sqlite3, sys
payload=json.loads(sys.stdin.read())
con=sqlite3.connect(payload['databasePath'])
try:
    con.execute('PRAGMA foreign_keys=ON')
    for item in payload['files']:
        con.executescript(item['sql'])
        print('PASS '+item['name'])
    tables={row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    missing=[name for name in payload['expectedTables'] if name not in tables]
    if missing: raise RuntimeError('Thiếu bảng sau migrate: '+', '.join(missing))
    for table, expected in payload['expectedColumns'].items():
        actual={row[1] for row in con.execute('PRAGMA table_info("'+table.replace('"','""')+'")')}
        absent=[name for name in expected if name not in actual]
        if absent: raise RuntimeError(table+' thiếu cột: '+', '.join(absent))
    violations=list(con.execute('PRAGMA foreign_key_check'))
    if violations: raise RuntimeError('Foreign-key violations: '+repr(violations[:5]))
    print(f"TABLES {len(tables)} EXPECTED {len(payload['expectedTables'])} MISSING []")
    print('FK_CHECK []')
finally:
    con.close()
`;
  const result = spawnSync(process.env.PYTHON || 'python3', ['-c', source], { input: payload, encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Migration check bằng Python thất bại (exit ${result.status})`);
}

const tempDir = join(tmpdir(), `discord-ticket-migrations-${crypto.randomUUID()}`);
const databasePath = join(tempDir, 'migration-test.db');
await mkdir(tempDir, { recursive: true });
try {
  const files = await migrationFiles();
  const expected = await expectedSchema();
  if (!files.length) throw new Error('Không tìm thấy migration.sql');
  if (!expected.tables.length) throw new Error('Không đọc được model Prisma');
  const usedNode = await runWithNodeSqlite(files, databasePath, expected);
  if (!usedNode) runWithPython(files, databasePath, expected);
  console.log(`✅ Migration chain hợp lệ: ${files.length} migration`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
