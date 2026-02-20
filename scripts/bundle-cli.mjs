#!/usr/bin/env node
/**
 * Bundle the SnoutGuard CLI into a single file for npm distribution.
 *
 * Native/binary dependencies are kept external:
 * - better-sqlite3 (C++ addon, compiled per platform)
 * - chokidar (optional, used for watch mode)
 *
 * Everything else (all @snoutguard/* packages, commander, chalk, etc.)
 * is bundled into a single ESM file.
 */

import * as esbuild from 'esbuild';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const outfile = 'packages/cli/dist/snoutguard.cjs';

// Get the git version for the banner
let version = '0.1.0';
try {
  const pkg = JSON.parse(fs.readFileSync('packages/cli/package.json', 'utf-8'));
  version = pkg.version;
} catch {}

const result = await esbuild.build({
  entryPoints: ['packages/cli/src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile,
  sourcemap: false,
  minify: false, // Keep readable for debugging
  treeShaking: true,

  // Native addons and optional deps must stay external
  external: [
    'better-sqlite3',
    'chokidar',
    'pg-native',       // Optional postgres driver
    'bufferutil',       // Optional ws dependency
    'utf-8-validate',   // Optional ws dependency
  ],

  // Node.js built-ins are automatically external with platform: 'node'

  banner: {
    js: [
      `// SnoutGuard CLI v${version}`,
      '// https://github.com/rjc25/SnoutGuard',
      `// Bundled: ${new Date().toISOString()}`,
    ].join('\n'),
  },

  // Resolve workspace packages
  alias: {},

  // Log level
  logLevel: 'info',
});

// Strip any shebangs from the source (esbuild preserves them from entry point)
// then add a single clean shebang as the very first line
let content = fs.readFileSync(outfile, 'utf-8');
content = content.replace(/^#!.*\n/gm, '');
fs.writeFileSync(outfile, '#!/usr/bin/env node\n' + content);

// Report size
const stats = fs.statSync(outfile);
const sizeKB = Math.round(stats.size / 1024);
console.log(`\n✅ Bundled to ${outfile} (${sizeKB} KB)`);

if (result.errors.length > 0) {
  console.error('Build errors:', result.errors);
  process.exit(1);
}
