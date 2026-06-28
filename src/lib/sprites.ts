import hostedIds from '../data/pokemon-sprites.json';

// The animated Pokémon webps are too large to keep in the repo/Docker image, so
// they live in a public bucket. Override with PUBLIC_SPRITE_BASE for local
// testing (e.g. a different bucket, or '/sprites/pokemon' to serve them locally).
export const SPRITE_BASE =
  import.meta.env.PUBLIC_SPRITE_BASE ?? 'https://storage.googleapis.com/justhit-sprites/pokemon';

const HOSTED = new Set(hostedIds as string[]);

/**
 * The URL of our self-hosted animated sprite for a Showdown sprite-id, or null
 * when we don't have one (gmax/totems/cosmetics) — the caller then falls back
 * to the Showdown CDN. `id` is the basename Showdown uses (no extension).
 */
export function hostedSpriteUrl(id: string): string | null {
  return id && HOSTED.has(id) ? `${SPRITE_BASE}/${id}.webp` : null;
}
