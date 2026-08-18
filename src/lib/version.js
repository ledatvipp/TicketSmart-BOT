import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

let version = 'unknown';
try {
  const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version || version;
} catch { /* version is informational; startup must not fail */ }

export const APP_VERSION = version;
