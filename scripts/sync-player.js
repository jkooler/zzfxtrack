#!/usr/bin/env node
/**
 * Copy the three ZzFXTrack Player source files from src/ into
 * packages/zzfxtrack-player/src/ so the package stays in sync.
 * Run from repo root: node scripts/sync-player.js
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcDir = join(root, 'src');
const pkgSrcDir = join(root, 'packages', 'zzfxtrack-player', 'src');

const files = ['zzfx-core.js', 'mix-settings.js', 'zzfxtrack-player.js'];

mkdirSync(pkgSrcDir, { recursive: true });
for (const name of files) {
  const from = join(srcDir, name);
  const to = join(pkgSrcDir, name);
  const content = readFileSync(from, 'utf8');
  writeFileSync(to, content);
  console.log(`Synced ${name}`);
}
console.log('Done. packages/zzfxtrack-player is up to date with src/.');
