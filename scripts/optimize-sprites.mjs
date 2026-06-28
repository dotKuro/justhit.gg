// Optimize the renamed HOME gifs into small animated WebP for the web.
//   public/sprites/pokemon/<id>.gif  ->  public/sprites/pokemon/<id>.webp
//
// Per sprite:
//   1. ffmpeg drops the frame rate to 15fps at full resolution (the fps filter
//      is the big size lever) into a temp gif, keeping transparency.
//   2. sharp DOWNSCALES + encodes the animated WebP. The resize MUST happen in
//      sharp/libvips, not ffmpeg: libvips premultiplies alpha when resizing, so
//      transparent edges stay clean. ffmpeg's lanczos scale into a 1-bit-alpha
//      gif blends the transparent-but-white source into the edges and bakes in
//      a white halo. sharp also sets frame disposal correctly (no ghosting),
//      unlike ffmpeg's `-c:v libwebp`.
//
// Also writes src/data/pokemon-sprites.json (the ids we host) for the site.
// Run AFTER build-sprites.mjs. The webps are uploaded to the bucket separately
// (scripts/upload-sprites.mjs) and are NOT committed to the repo.
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
const MANIFEST = path.resolve('src/data/pokemon-sprites.json');
const MAX_DIM = 256; // covers the ~224px (112px @2x) single-mon hero view crisply
const FPS = 15;
const QUALITY = 82;
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
    // Drop fps at full resolution; palettegen/paletteuse with reserve_transparent
    // keeps transparency through the gif intermediate. We deliberately do NOT
    // scale here — sharp does the resize so alpha edges stay clean (see header).
    await ffmpeg([
      '-y', '-i', src,
      '-vf',
      `fps=${FPS},split[s0][s1];[s0]palettegen=reserve_transparent=1[p];[s1][p]paletteuse=alpha_threshold=128`,
      tmp,
    ]);
    // libvips premultiplies alpha when resizing (no white halo), composites
    // frames (no ghosting), then encodes. effort only trades time for size.
    await sharp(tmp, { animated: true })
      .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 4 })
      .toFile(out);
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

// Manifest of the ids we host, so the site knows which sprites exist on the
// bucket (it can't stat the bucket at build time).
const hostedIds = fs
  .readdirSync(DIR)
  .filter((f) => f.toLowerCase().endsWith('.webp'))
  .map((f) => f.replace(/\.webp$/i, ''))
  .sort();
fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(MANIFEST, JSON.stringify(hostedIds));

console.log(`\n\nDone in ${((Date.now() - t0) / 1000).toFixed(0)}s.`);
console.log(`  manifest:  ${path.relative(process.cwd(), MANIFEST)} (${hostedIds.length} ids)`);
console.log(`  converted: ${gifs.length - failed}/${gifs.length}`);
console.log(`  size:      ${mb(bytesIn)} -> ${mb(bytesOut)}  (${(100 - (bytesOut / bytesIn) * 100).toFixed(1)}% smaller)`);
console.log(`  avg webp:  ${(bytesOut / (gifs.length - failed) / 1024).toFixed(1)} KB`);
if (CLEAN) console.log(`  source gifs deleted (--clean)`);
if (errors.length) {
  console.log(`\n  ${errors.length} failures:`);
  errors.slice(0, 15).forEach((e) => console.log('   - ' + e));
}
