// Mirror the optimized Pokémon webps to the public GCS bucket. Run after
// optimize-sprites.mjs, before deploying.
//
//   node scripts/upload-sprites.mjs
//
// Requires gsutil (gcloud SDK) installed and authenticated for a project with
// write access to the bucket. Override the destination with SPRITE_BUCKET.
//
// -d mirrors (deletes bucket objects no longer produced locally); the
// Cache-Control matches the Caddy policy for the local item sprites: cacheable
// for a day but revalidatable, since sprite URLs are stable but their contents
// can change when we re-render.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const SRC = 'public/sprites/pokemon';
const DEST = process.env.SPRITE_BUCKET ?? 'gs://justhit-sprites/pokemon';

const count = fs.existsSync(SRC)
  ? fs.readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.webp')).length
  : 0;
if (count === 0) {
  console.error(`No webps in ${SRC}. Run build-sprites.mjs + optimize-sprites.mjs first.`);
  process.exit(1);
}

console.log(`Uploading ${count} sprites: ${SRC} -> ${DEST}`);
const p = spawn(
  'gsutil',
  ['-m', '-h', 'Cache-Control:public, max-age=86400', 'rsync', '-r', '-d', SRC, DEST],
  { stdio: 'inherit' },
);
p.on('error', (e) => {
  console.error(`Failed to launch gsutil (${e.message}). Is the gcloud SDK installed and on PATH?`);
  process.exit(1);
});
p.on('close', (c) => process.exit(c ?? 0));
