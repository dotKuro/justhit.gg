import type { APIRoute } from 'astro';
import hostedIds from '../../data/pokemon-sprites.json';

// Lists every sprite slug justhit.gg hosts (no extension). The same slug
// resolves to both renders on the bucket:
//   <bucket>/pokemon/<slug>.webp        (animated, full quality)
//   <bucket>/pokemon-pixel/<slug>.png   (pre-sliced 40x30 box icon)
//
// The site is statically built, so this endpoint is baked into the deploy —
// it always matches the manifest the pages were built with.
export const GET: APIRoute = () => {
  const slugs = [...(hostedIds as string[])].sort();
  return new Response(JSON.stringify(slugs), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
