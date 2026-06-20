// Normalizes the local HOME animated-gif pack into a clean, Showdown-id-named
// folder: public/sprites/pokemon/<spriteid>.gif
//
// Source of truth = @pkmn (Dex + img). We iterate every real species, derive its
// canonical Showdown sprite id, and find the matching HOME file by dex number +
// STRICT forme-token matching (a file is only claimed on an exact token-set
// match, so forms the pack lacks just fall back to the CDN instead of stealing a
// sibling's gif). The fan/Champions "new_megas" are mapped too (canonical id if
// @pkmn knows them, best-guess slug otherwise).
//
// Run: node scripts/build-sprites.mjs        (writes files + report)
//      node scripts/build-sprites.mjs --dry   (report only, no copying)

import { Dex } from '@pkmn/dex';
import { Sprites } from '@pkmn/img';
import fs from 'node:fs';
import path from 'node:path';

// Source pack lives outside public/ (it's 5.7 GB and must never be served).
const MAIN = path.resolve('sprite-source/Pokémon HOME - Non-Shiny Gifs - v1.0 root(S4MUR41)');
const MEGAS = path.join(MAIN, 'new_megas');
const OUT = path.resolve('public/sprites/pokemon');
const DRY = process.argv.includes('--dry');

const toID = (s) => (s ?? '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '');

// Canonical Showdown sprite id for a species (e.g. "weezing-galar").
const spriteId = (name) => {
  const url = Sprites.getPokemon(name).url;
  return decodeURIComponent(url.split('/').pop()).replace(/\.(gif|png|webp)$/i, '');
};

// ---- forme-token normalization -------------------------------------------
const STOP = new Set([
  'form', 'forme', 'mode', 'style', 'rotom', 'the', 'of', 'color', 'colour',
  'type', 'cloak', 'pattern', 'trim', 'mask', 'sea', 'cap', 'drive', 'sweet',
  'cream', 'swirl', 'core', 'flower', 'plumage', 'build', 'face',
]);
const ALIAS = {
  galarian: 'galar', alolan: 'alola', hisuian: 'hisui', paldean: 'paldea',
  female: 'f', male: 'm',
};
const NUM_ALIAS = { 128: { fire: 'blaze', water: 'aqua' } }; // Tauros-Paldea

// Per-dex# rewrites of HOME form text that uses extra descriptor words @pkmn
// doesn't (scoped per-number so we never clobber a real forme like Aegislash's
// "Shield"). Applied only to HOME filenames; the @pkmn side is already clean.
const FORM_FIXUP = {
  888: (s) => s.replace(/crowned sword/i, 'Crowned').replace(/hero of many battles/i, 'Hero'),
  889: (s) => s.replace(/crowned shield/i, 'Crowned').replace(/hero of many battles/i, 'Hero'),
  898: (s) => s.replace(/shadow rider/i, 'Shadow').replace(/ice rider/i, 'Ice'),
  128: (s) => s.replace(/^paldean$/i, 'Paldea Combat'),
};

// Source-pack typos / dex#-only-disambiguated bases -> correct @pkmn baseId.
const BASE_TYPO = { hrliolisk: 'heliolisk' };
const NUM_BASE = { 29: 'nidoranf', 32: 'nidoranm' };
const baseIdFor = (num, base) => NUM_BASE[num] ?? BASE_TYPO[toID(base)] ?? toID(base);

function tokens(formText, num) {
  if (!formText) return [];
  const na = NUM_ALIAS[num] ?? {};
  return formText
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => ALIAS[t] ?? na[t] ?? t)
    .filter((t) => !STOP.has(t));
}
const sig = (toks) => [...new Set(toks)].sort().join(',');

// ---- parse a HOME filename ------------------------------------------------
function parseHome(file, num) {
  const name = file.replace(/\.gif$/i, '');
  const m = name.match(/^(\d{3,4})\s*-\s*(.+)$/);
  if (!m) return null;
  const dex = parseInt(m[1], 10);
  let rest = m[2].trim();

  let form = '';
  // Tolerant of a missing closing paren (the pack has e.g. "(Crowned Shield").
  const paren = rest.match(/\(([^)]*?)\)?\s*$/);
  if (paren && paren[0].includes('(')) {
    form = paren[1].trim();
    rest = rest.slice(0, paren.index).trim();
  }
  // Primal prefix works like Mega: "Primal Kyogre" -> base "Kyogre", form "Primal".
  if (/^Primal\s+/i.test(rest)) {
    rest = rest.replace(/^Primal\s+/i, '');
    form = 'Primal';
  }
  if (/^Mega\s+/i.test(rest)) {
    let body = rest.replace(/^Mega\s+/i, '');
    let variant = '';
    const vm = body.match(/\s+([XYZ])$/);
    if (vm) {
      variant = vm[1];
      body = body.slice(0, vm.index).trim();
    }
    form = `Mega ${variant}`.trim();
    rest = body;
  }
  if (FORM_FIXUP[dex]) form = FORM_FIXUP[dex](form);
  return { num: dex, base: rest, form, sig: sig(tokens(form, dex)) };
}

const SKIP_FORM = /^(Alt Pose|Rev 1|\d+)$/i;

function readGifs(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.gif')) : [];
}

// num -> Map(baseId -> Map(formSig -> path))
const homeIndex = new Map();
for (const file of readGifs(MAIN)) {
  const p = parseHome(file);
  if (!p || (p.form && SKIP_FORM.test(p.form))) continue;
  if (!homeIndex.has(p.num)) homeIndex.set(p.num, new Map());
  const byBase = homeIndex.get(p.num);
  const bid = baseIdFor(p.num, p.base);
  if (!byBase.has(bid)) byBase.set(bid, new Map());
  const bySig = byBase.get(bid);
  if (!bySig.has(p.sig)) bySig.set(p.sig, path.join(MAIN, file)); // first wins
}

// ---- match every species to a HOME file (STRICT) --------------------------
const plan = new Map(); // spriteid -> source path
const usedPaths = new Set();

const species = Dex.species
  .all()
  .filter((s) => s.num > 0 && s.isNonstandard !== 'CAP' && s.isNonstandard !== 'Custom');

function wantSig(s) {
  const f = (s.forme || s.baseForme || '').replace(/-/g, ' ');
  return sig(tokens(f, s.num));
}

for (const s of species) {
  const id = spriteId(s.name);
  if (plan.has(id)) continue;
  const byBase = homeIndex.get(s.num);
  if (!byBase) continue;
  const bySig = byBase.get(toID(s.baseSpecies));
  if (!bySig) continue;
  // Alt formes: exact token-set match only. Base species: try its baseForme
  // sig, then a plain file, then a male default (gendered bases like Meowstic).
  const trySigs = s.forme === '' ? [...new Set([wantSig(s), '', 'm'])] : [wantSig(s)];
  let src;
  for (const sg of trySigs) {
    const cand = bySig.get(sg);
    if (cand && !usedPaths.has(cand)) {
      src = cand;
      break;
    }
  }
  if (src) {
    plan.set(id, src);
    usedPaths.add(src);
  }
}

// ---- new_megas (Champions) ------------------------------------------------
const megaGuesses = [];
const IGNORE_EXTRA = /^(Rev\s*\d+|Alt Pose|\d+)$/i;
for (const file of readGifs(MEGAS)) {
  const nm = file.replace(/\.gif$/i, '');
  let body = nm;
  let extra = '';
  const paren = body.match(/\(([^)]*)\)\s*$/);
  if (paren) {
    extra = paren[1].trim();
    body = body.slice(0, paren.index).trim();
  }
  if (extra && IGNORE_EXTRA.test(extra)) extra = '';

  // Build candidate Showdown names, most specific first.
  const candidates = [];
  if (/^Mega\s+/i.test(body)) {
    let b = body.replace(/^Mega\s+/i, '');
    let variant = '';
    const vm = b.match(/\s+([XYZ])$/);
    if (vm) {
      variant = vm[1];
      b = b.slice(0, vm.index).trim();
    }
    if (variant) candidates.push(`${b}-Mega-${variant}`);
    candidates.push(`${b}-Mega`);
  } else if (/^Eternal\s+/i.test(body)) {
    candidates.push(`${body.replace(/^Eternal\s+/i, '')}-Eternal`);
  } else {
    candidates.push(body);
  }

  let id = null;
  for (const c of candidates) {
    const k = Dex.species.get(c);
    if (k && k.exists && k.num > 0) {
      id = spriteId(k.name);
      break;
    }
  }
  let guessed = false;
  if (!id) {
    const parts = candidates[0].split('-');
    const b = toID(parts.shift());
    const f = toID(parts.join(''));
    id = f ? `${b}-${f}` : b;
    if (extra) id += `-${toID(extra)}`;
    guessed = true;
  }

  const src = path.join(MEGAS, file);
  if (!plan.has(id)) {
    plan.set(id, src);
    if (guessed) megaGuesses.push({ file, id });
  }
}

// ---- write ----------------------------------------------------------------
if (!DRY) {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const [id, src] of plan) fs.copyFileSync(src, path.join(OUT, `${id}.gif`));
}

// ---- report ---------------------------------------------------------------
const unmatched = species.map((s) => spriteId(s.name)).filter((id) => !plan.has(id));
const uniqUnmatched = [...new Set(unmatched)];

// Sanity: a set of competitively-relevant ids that MUST be present.
const MUST = [
  'weezing-galar', 'urshifu-rapidstrike', 'urshifu', 'landorus-therian', 'rotom-heat',
  'rotom-wash', 'ogerpon-wellspring', 'ogerpon-hearthflame', 'tauros-paldeablaze',
  'tauros-paldeaaqua', 'charizard-megax', 'charizard-megay', 'darmanitan-galar',
  'calyrex-shadow', 'calyrex-ice', 'zacian-crowned', 'zamazenta-crowned', 'kyurem-black',
  'chiyu', 'fluttermane', 'incineroar', 'rillaboom', 'amoonguss', 'gholdengo',
  'tauros-paldeacombat', 'meowstic-f', 'indeedee-f',
];
const missingMust = MUST.filter((id) => !plan.has(id));

const report = [
  `Sprite normalization report`,
  `===========================`,
  `Species in @pkmn dex:          ${species.length}`,
  `Mapped -> pokemon/*.gif:       ${plan.size}`,
  `new_megas best-guessed slugs:  ${megaGuesses.length}`,
  `Species w/ no local gif (CDN): ${uniqUnmatched.length}`,
  ``,
  `MUST-HAVE check: ${missingMust.length === 0 ? 'ALL PRESENT ✓' : 'MISSING -> ' + missingMust.join(', ')}`,
  ``,
  `--- new_megas best-guessed slugs (not yet on Showdown per @pkmn) ---`,
  ...(megaGuesses.length ? megaGuesses.map((g) => `  ${g.id}.gif   <-  ${g.file}`) : ['  (none — all resolved canonically)']),
  ``,
  `--- species with no local gif (fall back to CDN) ---`,
  ...uniqUnmatched.slice(0, 80).map((id) => `  ${id}`),
  uniqUnmatched.length > 80 ? `  ...and ${uniqUnmatched.length - 80} more` : '',
].join('\n');

fs.writeFileSync(path.join(path.resolve('scripts'), 'sprite-map-report.txt'), report);
console.log(report);
