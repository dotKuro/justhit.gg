import { Team, type PokemonSet } from '@pkmn/sets';
import { Dex } from '@pkmn/dex';

/** Fetch a poképaste URL's raw export text (appends /raw). */
export async function fetchPaste(src: string): Promise<string | null> {
  const base = src.trim().replace(/\/+$/, '');
  const url = base.endsWith('/raw') ? base : `${base}/raw`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Parse a Showdown export into its sets. */
export function parseTeam(text: string): Partial<PokemonSet>[] {
  return Team.import(text)?.team ?? [];
}

/** The single ability a species mega-evolves into (slot 0), if any. */
const megaAbilityOf = (megaName: string) => Dex.species.get(megaName).abilities?.['0'] ?? null;

/**
 * A mon shows its mega when it either *is* a mega forme in the paste, or holds
 * the mega stone that evolves it. Returns the species to draw the sprite for,
 * the name to display (always the base name for megas), and the post-mega ability.
 */
export function resolveMega(species: string, item?: string) {
  const sp = Dex.species.get(species);

  // Already written as a mega forme in the paste.
  if (sp.exists && /^Mega/i.test(sp.forme ?? '')) {
    return { spriteSpecies: sp.name, displayName: sp.baseSpecies, megaAbility: megaAbilityOf(sp.name) };
  }

  // Base form holding its mega stone -> draw the mega, keep the base name.
  if (item) {
    const stone = (Dex.items.get(item) as { megaStone?: Record<string, string> }).megaStone;
    const megaName = stone?.[sp.baseSpecies || sp.name];
    if (megaName) {
      return { spriteSpecies: megaName, displayName: sp.baseSpecies || sp.name, megaAbility: megaAbilityOf(megaName) };
    }
  }

  return { spriteSpecies: species, displayName: species, megaAbility: null };
}

/** Mega-resolved species list from a paste URL, for compact icon rows. */
export async function teamIconSpecies(src: string): Promise<string[]> {
  const text = await fetchPaste(src);
  if (!text) return [];
  return parseTeam(text).map(
    (set) => resolveMega(set.species ?? set.name ?? 'Unknown', set.item).spriteSpecies,
  );
}
