import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
import { spawnSync } from 'child_process';
import { join, relative } from 'path';
import { tmpdir } from 'os';

const ROOTS = ['src', 'scripts', 'tests'];
const ignored = ['src/generated', 'src/web/node_modules', 'src/web/dist'];
const jsFiles = ['index.js'];
const vueFiles = [];

function isIgnored(path) {
  const normalized = path.replaceAll('\\', '/');
  return ignored.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

async function walk(path) {
  if (isIgnored(path)) return;
  const info = await stat(path);
  if (info.isDirectory()) {
    for (const name of await readdir(path)) await walk(join(path, name));
  } else if (path.endsWith('.js')) jsFiles.push(path);
  else if (path.endsWith('.vue')) vueFiles.push(path);
}

for (const root of ROOTS) await walk(root);
let failed = false;

function checkFile(file, displayName = file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    console.error(`\n❌ ${displayName}\n${result.stderr}`);
  }
}

for (const file of jsFiles) checkFile(file, relative(process.cwd(), file));

const temp = await mkdtemp(join(tmpdir(), 'ticket-vue-syntax-'));
try {
  for (const file of vueFiles) {
    const source = await readFile(file, 'utf8');
    const blocks = [...source.matchAll(/<script(?:\s+setup)?(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi)];
    for (const [index, match] of blocks.entries()) {
      const temporary = join(temp, `${Buffer.from(file).toString('hex')}-${index}.mjs`);
      await writeFile(temporary, match[1], 'utf8');
      checkFile(temporary, `${relative(process.cwd(), file)} <script #${index + 1}>`);
    }
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}

for (const jsonFile of ['package.json', 'package-lock.json', 'src/web/package.json', 'src/web/package-lock.json']) {
  try { JSON.parse(await readFile(jsonFile, 'utf8')); }
  catch (error) {
    failed = true;
    console.error(`\n❌ ${jsonFile}\n${error.message}`);
  }
}

if (failed) process.exit(1);
console.log(`✅ Syntax OK: ${jsFiles.length} JavaScript files, ${vueFiles.length} Vue components`);
