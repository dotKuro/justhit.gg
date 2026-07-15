// Mirror the optimized Pokémon sprites (animated webps + lossless still pngs)
// and the Serebii item renders to the public GCS bucket. Run after
// optimize-sprites.mjs / fetch-items.mjs, before deploying.
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

const BUCKET = process.env.SPRITE_BUCKET ?? 'gs://justhit-sprites';
const SYNCS = [
  { src: 'public/sprites/pokemon', dest: `${BUCKET}/pokemon`, ext: '.webp', label: 'webps' },
  { src: 'public/sprites/items', dest: `${BUCKET}/items`, ext: '.png', label: 'pngs' },
];

const rsync = ({ src, dest }) =>
  new Promise((resolve) => {
    const p = spawn(
      'gsutil',
      ['-m', '-h', 'Cache-Control:public, max-age=86400', 'rsync', '-r', '-d', src, dest],
      { stdio: 'inherit' },
    );
    p.on('error', (e) => {
      console.error(`Failed to launch gsutil (${e.message}). Is the gcloud SDK installed and on PATH?`);
      resolve(1);
    });
    p.on('close', (c) => resolve(c ?? 0));
  });

let exitCode = 0;
for (const sync of SYNCS) {
  const count = fs.existsSync(sync.src)
    ? fs.readdirSync(sync.src).filter((f) => f.toLowerCase().endsWith(sync.ext)).length
    : 0;
  if (count === 0) {
    console.error(`No ${sync.label} in ${sync.src}. Run the build/fetch scripts first.`);
    exitCode = 1;
    continue;
  }
  console.log(`Uploading ${count} ${sync.label}: ${sync.src} -> ${sync.dest}`);
  const c = await rsync(sync);
  if (c !== 0) exitCode = c;
}
process.exit(exitCode);
