// Exports the pixelated box icons as pre-sliced 40x30 PNGs, one per hosted
// full-quality sprite, named exactly like the webps (<spriteid>.png). Slices
// the same local sheet the site's CSS slicing uses
// (public/sprites/pokemonicons-sheet.png via @pkmn/img Icons offsets), so the
// crops match what PokemonIcon.astro renders 1:1.
//
// Only ids present in src/data/pokemon-sprites.json are exported. Ids that
// can't be sliced (no @pkmn species for the id, or the icon falls back to the
// blank slot at 0,0) are flagged in the report.
//
// Run: node scripts/export-pixel-icons.mjs   -> exports/pixel-sprites/

import { Dex } from '@pkmn/dex';
import { Icons, Sprites } from '@pkmn/img';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SHEET = path.resolve('public/sprites/pokemonicons-sheet.png');
const OUT = path.resolve('exports/pixel-sprites');
const W = 40;
const H = 30;

const hostedIds = JSON.parse(fs.readFileSync('src/data/pokemon-sprites.json', 'utf8'));

// Same sprite-id derivation as build-sprites.mjs.
const spriteId = (name) => {
  const url = Sprites.getPokemon(name).url;
  return decodeURIComponent(url.split('/').pop()).replace(/\.(gif|png|webp)$/i, '');
};

// spriteid -> species name (first wins, mirroring build-sprites.mjs).
const nameById = new Map();
for (const s of Dex.species.all()) {
  if (s.num <= 0 || s.isNonstandard === 'CAP' || s.isNonstandard === 'Custom') continue;
  const id = spriteId(s.name);
  if (!nameById.has(id)) nameById.set(id, s.name);
}

const sheet = sharp(SHEET);
const { width: sheetW, height: sheetH } = await sheet.metadata();

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const flagged = []; // { id, reason }
let written = 0;

for (const id of hostedIds) {
  const name = nameById.get(id);
  if (!name) {
    flagged.push({ id, reason: 'no @pkmn species maps to this sprite-id (fan/Champions mega slug)' });
    continue;
  }
  const icon = Icons.getPokemon(name);
  const left = -icon.left;
  const top = -icon.top;
  if (left === 0 && top === 0) {
    flagged.push({ id, reason: `icon for "${name}" falls back to the blank slot (no icon in sheet data)` });
    continue;
  }
  if (left + W > sheetW || top + H > sheetH) {
    flagged.push({ id, reason: `icon offset ${left},${top} is outside the local sheet (${sheetW}x${sheetH})` });
    continue;
  }
  await sharp(SHEET)
    .extract({ left, top, width: W, height: H })
    .png()
    .toFile(path.join(OUT, `${id}.png`));
  written++;
}

const report = [
  `Pixel icon export report`,
  `========================`,
  `Hosted full-quality sprites:   ${hostedIds.length}`,
  `Sliced -> pixel-sprites/*.png: ${written}`,
  `Could NOT slice:               ${flagged.length}`,
  ``,
  `--- flagged (have a full-quality sprite, but no sliceable icon) ---`,
  ...(flagged.length ? flagged.map((f) => `  ${f.id}   (${f.reason})`) : ['  (none)']),
].join('\n');

fs.writeFileSync(path.join(OUT, 'REPORT.txt'), report);
console.log(report);
