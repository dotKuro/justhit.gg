import type { CollectionEntry, CollectionKey } from 'astro:content';
import { defaultLang, type Lang } from '../i18n/ui';

/**
 * Group a collection's entries by slug (the id without its `<locale>/` prefix),
 * pick the current language, and fall back to the default language when a
 * translation is missing. Returns one entry per slug.
 *
 * `isFallback` is true when the chosen entry is the default-language original
 * because the requested locale has no translation.
 */
export function localizedEntries<C extends CollectionKey>(
  entries: CollectionEntry<C>[],
  lang: Lang,
): { slug: string; entry: CollectionEntry<C>; isFallback: boolean }[] {
  const bySlug = new Map<string, Partial<Record<Lang, CollectionEntry<C>>>>();
  for (const entry of entries) {
    const [loc, ...rest] = entry.id.split('/');
    const slug = rest.join('/');
    if (!bySlug.has(slug)) bySlug.set(slug, {});
    bySlug.get(slug)![loc as Lang] = entry;
  }

  return [...bySlug.entries()]
    .map(([slug, locs]) => ({
      slug,
      entry: locs[lang] ?? locs[defaultLang],
      isFallback: !locs[lang],
    }))
    .filter((r): r is { slug: string; entry: CollectionEntry<C>; isFallback: boolean } =>
      Boolean(r.entry),
    );
}
