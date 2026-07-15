// Fetch item renders from Serebii into public/sprites/items/<id>.png.
// Prefers the HQ 160x160 SV render (itemdex/sprites/sv/<id>.png, the big image
// on each itemdex page); items without one (older-gen items not in SV) fall
// back to the classic ~40px itemdex render. @pkmn's item.id matches Serebii's
// naming (e.g. "Choice Specs" -> "choicespecs"). Items with neither sprite
// (TMs, key items, etc.) just 404 and are skipped — TeamPreview falls back to
// the Showdown pixel sheet for anything missing.
//
// Also writes src/data/item-sprites.json (the ids we host). The pngs are NOT
// committed; push them to the bucket with scripts/upload-sprites.mjs.
//
//   node scripts/fetch-items.mjs

import { Dex } from '@pkmn/dex';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('public/sprites/items');
const MANIFEST = path.resolve('src/data/item-sprites.json');
// Tried best-first: sv/ and za/ hold the 160x160 HQ renders (SV and Legends
// Z-A; za covers mega stones), pgl/ the 80x80 Global Link renders (same art
// style; covers Z-crystals, gems, memories...), the root the classic ~40px.
const BASES = [
  { base: 'https://www.serebii.net/itemdex/sprites/sv', tier: 'hq' },
  { base: 'https://www.serebii.net/itemdex/sprites/za', tier: 'hq' },
  { base: 'https://www.serebii.net/itemdex/sprites/pgl', tier: 'mid' },
  { base: 'https://www.serebii.net/itemdex/sprites', tier: 'low' },
];
const CONCURRENCY = 6; // gentle on Serebii
const UA = 'Mozilla/5.0 (justhit.gg sprite build)';

fs.mkdirSync(OUT, { recursive: true });

// All real items; 404s (non-held / no sprite) are simply skipped.
const items = Dex.items.all().filter((i) => i.exists && i.id);

const counts = { hq: 0, mid: 0, low: 0 };
let miss = 0;
let done = 0;
const failures = [];
const midRes = [];
const lowRes = [];

async function fetchPng(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok || !(res.headers.get('content-type') || '').includes('image')) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > 0 ? buf : null;
}

// Serebii filenames keep apostrophes and hyphens that @pkmn ids strip
// ("King's Rock" -> king'srock.png, "Never-Melt Ice" -> never-meltice.png),
// so try the id plus a lowercased-name variant with only spaces removed.
function candidates(item) {
  return [...new Set([item.id, item.name.toLowerCase().replace(/ /g, '')])];
}

async function fetchFirst(item) {
  for (const { base, tier } of BASES) {
    for (const name of candidates(item)) {
      const buf = await fetchPng(`${base}/${encodeURIComponent(name)}.png`);
      if (buf) return { buf, tier };
    }
  }
  return null;
}

async function fetchItem(item) {
  const out = path.join(OUT, `${item.id}.png`);
  try {
    const hit = await fetchFirst(item);
    if (hit) {
      fs.writeFileSync(out, hit.buf);
      counts[hit.tier]++;
      if (hit.tier === 'mid') midRes.push(item.id);
      if (hit.tier === 'low') lowRes.push(item.id);
    } else {
      miss++;
    }
  } catch (e) {
    miss++;
    failures.push(`${item.id}: ${e.message}`);
  }
  if (++done % 100 === 0 || done === items.length) {
    process.stdout.write(
      `\r  ${done}/${items.length} (${counts.hq} HQ, ${counts.mid} mid, ${counts.low} low, ${miss} skipped)`,
    );
  }
}

async function run() {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) await fetchItem(queue.shift());
    }),
  );
}

console.log(`Fetching item renders for ${items.length} items -> public/sprites/items/ ...`);
const t0 = Date.now();
await run();
// Manifest of the ids we host, so the site knows which item renders exist on
// the bucket (same pattern as pokemon-sprites.json).
const hostedIds = fs
  .readdirSync(OUT)
  .filter((f) => f.toLowerCase().endsWith('.png'))
  .map((f) => f.replace(/\.png$/i, ''))
  .sort();
fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(MANIFEST, JSON.stringify(hostedIds));

console.log(`\n\nDone in ${((Date.now() - t0) / 1000).toFixed(0)}s.`);
console.log(`  manifest: ${path.relative(process.cwd(), MANIFEST)} (${hostedIds.length} ids)`);
console.log(`  HQ (160px SV/ZA render): ${counts.hq}`);
console.log(`  mid (80px PGL render):   ${counts.mid}`);
console.log(`  low-res fallback:        ${counts.low}`);
console.log(`  skipped:                 ${miss} (no Serebii sprite — TM/key/unheld items; CDN pixel fallback)`);
if (midRes.length) {
  console.log(`  mid-res ids: ${midRes.sort().join(', ')}`);
}
if (lowRes.length) {
  console.log(`  low-res ids: ${lowRes.sort().join(', ')}`);
}
if (failures.length) {
  console.log(`  ${failures.length} fetch errors (first 10):`);
  failures.slice(0, 10).forEach((f) => console.log('   - ' + f));
}
