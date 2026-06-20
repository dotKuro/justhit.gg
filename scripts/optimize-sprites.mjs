// Optimize the renamed HOME gifs into small animated WebP for the web.
//   public/sprites/pokemon/<id>.gif  ->  public/sprites/pokemon/<id>.webp
//
// Two stages per sprite:
//   1. ffmpeg: drop to 15fps + downscale to 128px -> a temp gif (the fps filter
//      is the big size lever; ffmpeg's own gif encoder composites frames fully).
//   2. sharp: temp gif -> animated WebP.
//
// NB: we deliberately do NOT use ffmpeg's `-c:v libwebp` directly — its animated
// encoder doesn't set frame disposal, so transparent sprites ghost ("past frames
// visible"). Encoding the webp with sharp/libvips avoids that. Run AFTER
// build-sprites.mjs.
//
//   node scripts/optimize-sprites.mjs            convert (keeps gifs)
//   node scripts/optimize-sprites.mjs --clean    convert, then delete source gifs

import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = path.resolve('public/sprites/pokemon');
const MAX_DIM = 160; // ~2x the 80px display box — crisp on retina
const FPS = 15;
const QUALITY = 85;
const CONCURRENCY = Math.max(2, os.cpus().length - 2);
const CLEAN = process.argv.includes('--clean');

sharp.cache(false);
sharp.concurrency(1); // one thread per call; the pool below provides parallelism

const gifs = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.gif'));
let done = 0;
let failed = 0;
let bytesIn = 0;
let bytesOut = 0;
const errors = [];

const ffmpeg = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(err.trim().split('\n').pop()))));
  });

async function convert(file, i) {
  const src = path.join(DIR, file);
  const out = path.join(DIR, file.replace(/\.gif$/i, '.webp'));
  const tmp = path.join(os.tmpdir(), `jh-sprite-${process.pid}-${i}.gif`);
  try {
    // The palettegen/paletteuse pass with reserve_transparent + alpha_threshold
    // keeps the sprite's transparency through the gif intermediate (a plain gif
    // re-encode drops it, baking in the white that sits under transparent px).
    await ffmpeg([
      '-y', '-i', src,
      '-vf',
      `fps=${FPS},scale=${MAX_DIM}:${MAX_DIM}:force_original_aspect_ratio=decrease:flags=lanczos,` +
        `split[s0][s1];[s0]palettegen=reserve_transparent=1[p];[s1][p]paletteuse=alpha_threshold=128`,
      tmp,
    ]);
    // effort only trades encode time for file size (not visual quality at a
    // fixed quality); 4 is ~10x faster than 6 for a ~15% size bump.
    await sharp(tmp, { animated: true }).webp({ quality: QUALITY, effort: 4 }).toFile(out);
    bytesIn += fs.statSync(src).size;
    bytesOut += fs.statSync(out).size;
    if (CLEAN) fs.rmSync(src);
  } catch (e) {
    failed++;
    errors.push(`${file}: ${e.message}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  if (++done % 100 === 0 || done === gifs.length) {
    process.stdout.write(`\r  ${done}/${gifs.length} (${failed} failed)`);
  }
}

async function run() {
  let idx = 0;
  const next = () => idx++;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      let i;
      while ((i = next()) < gifs.length) await convert(gifs[i], i);
    }),
  );
}

const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';
console.log(`Optimizing ${gifs.length} gifs -> webp (${MAX_DIM}px, ${FPS}fps, q${QUALITY}, ${CONCURRENCY} workers)...`);
const t0 = Date.now();
await run();
console.log(`\n\nDone in ${((Date.now() - t0) / 1000).toFixed(0)}s.`);
console.log(`  converted: ${gifs.length - failed}/${gifs.length}`);
console.log(`  size:      ${mb(bytesIn)} -> ${mb(bytesOut)}  (${(100 - (bytesOut / bytesIn) * 100).toFixed(1)}% smaller)`);
console.log(`  avg webp:  ${(bytesOut / (gifs.length - failed) / 1024).toFixed(1)} KB`);
if (CLEAN) console.log(`  source gifs deleted (--clean)`);
if (errors.length) {
  console.log(`\n  ${errors.length} failures:`);
  errors.slice(0, 15).forEach((e) => console.log('   - ' + e));
}
