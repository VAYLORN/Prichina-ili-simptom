// Run after the client build. Bundles the local server and copies assets to the portable app.
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const portable = resolve(source, '..');
mkdirSync(resolve(portable, 'server'), { recursive: true });
await build({
  entryPoints: [resolve(source, 'server/index.ts')],
  outfile: resolve(portable, 'server/index.mjs'),
  platform: 'node', format: 'esm', target: 'node24', bundle: true,
  external: ['vite'],
  banner: { js: `import { createRequire as __createRequire } from 'node:module';
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __pathDirname } from 'node:path';
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __pathDirname(__filename);` },
});
cpSync(resolve(source, 'dist'), resolve(portable, 'dist'), { recursive: true });
console.log('Portable server and client updated; data preserved.');
