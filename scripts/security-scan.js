#!/usr/bin/env node
import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';

const roots = ['src', 'scripts'];
const ignored = ['src/generated', 'src/web/dist', 'src/web/node_modules'];
const findings = [];

function ignoredPath(path) {
  const normalized = path.replaceAll('\\', '/');
  return ignored.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}
async function walk(path) {
  if (ignoredPath(path)) return;
  const info = await stat(path);
  if (info.isDirectory()) {
    for (const name of await readdir(path)) await walk(join(path, name));
    return;
  }
  if (!/\.(?:js|vue)$/.test(path)) return;
  const source = await readFile(path, 'utf8');
  const rules = [
    { name: 'Vue v-html sink', regex: /\bv-html\s*=/g },
    { name: 'DOM innerHTML sink', regex: /\.innerHTML\s*=/g },
    { name: 'Dynamic code execution', regex: /\b(?:eval|Function)\s*\(/g },
    { name: 'Auth token persisted to localStorage', regex: /localStorage\.setItem\s*\(\s*['\"](?:token|refreshToken|accessToken|user)['\"]/gi },
    { name: 'Unsafe 50 MB JSON body limit', regex: /express\.json\s*\(\s*\{[^}]*limit\s*:\s*['\"]50mb['\"]/gis },
  ];
  for (const rule of rules) {
    for (const match of source.matchAll(rule.regex)) {
      const line = source.slice(0, match.index).split('\n').length;
      findings.push(`${path}:${line}: ${rule.name}`);
    }
  }
}

for (const root of roots) await walk(root);
if (findings.length) {
  console.error('❌ Security source scan failed:\n' + findings.join('\n'));
  process.exit(1);
}
console.log('✅ Security source scan PASS');
