// Fetch non-pixelated item icons (Serebii itemdex renders, ~40px, anti-aliased)
// into public/sprites/items/<id>.png. @pkmn's item.id matches Serebii's naming
// (e.g. "Choice Specs" -> "choicespecs"). Items without a Serebii sprite (TMs,
// key items, etc.) just 404 and are skipped — TeamPreview falls back to the
// Showdown pixel sheet for anything missing.
//
//   node scripts/fetch-items.mjs

import { Dex } from '@pkmn/dex';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = path.resolve('public/sprites/items');
const BASE = 'https://www.serebii.net/itemdex/sprites';
const CONCURRENCY = 6; // gentle on Serebii
const UA = 'Mozilla/5.0 (justhit.gg sprite build)';

fs.mkdirSync(OUT, { recursive: true });

// All real items; 404s (non-held / no sprite) are simply skipped.
const items = Dex.items.all().filter((i) => i.exists && i.id);

let ok = 0;
let miss = 0;
let done = 0;
const failures = [];

async function fetchItem(item) {
  const out = path.join(OUT, `${item.id}.png`);
  try {
    const res = await fetch(`${BASE}/${item.id}.png`, { headers: { 'User-Agent': UA } });
    if (res.ok && (res.headers.get('content-type') || '').includes('image')) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 0) {
        fs.writeFileSync(out, buf);
        ok++;
      } else {
        miss++;
      }
    } else {
      miss++;
    }
  } catch (e) {
    miss++;
    failures.push(`${item.id}: ${e.message}`);
  }
  if (++done % 100 === 0 || done === items.length) {
    process.stdout.write(`\r  ${done}/${items.length} (${ok} saved, ${miss} skipped)`);
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

console.log(`Fetching item icons for ${items.length} items -> public/sprites/items/ ...`);
const t0 = Date.now();
await run();
console.log(`\n\nDone in ${((Date.now() - t0) / 1000).toFixed(0)}s.`);
console.log(`  saved:   ${ok}`);
console.log(`  skipped: ${miss} (no Serebii sprite — TM/key/unheld items; CDN pixel fallback)`);
if (failures.length) {
  console.log(`  ${failures.length} fetch errors (first 10):`);
  failures.slice(0, 10).forEach((f) => console.log('   - ' + f));
}
