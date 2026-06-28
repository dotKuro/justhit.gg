import { useEffect, useState, type CSSProperties } from 'react';
import type { PokemonSet } from '@pkmn/sets';
import { Dex } from '@pkmn/dex';
import { Sprites, Icons } from '@pkmn/img';
import { fetchPaste, parseTeam, resolveMega } from '../lib/pokepaste';
import { useTranslations, type Lang } from '../i18n/ui';

const STAT_ORDER = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
const STAT_LABEL: Record<(typeof STAT_ORDER)[number], string> = {
  hp: 'HP',
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
};

type CardData = {
  set: Partial<PokemonSet>;
  species: string;
  spriteSpecies: string;
  megaAbility: string | null;
  natureFx: { plus: string; minus: string } | null;
  evs: (readonly [(typeof STAT_ORDER)[number], number])[];
};

/** The shareable id from a Poképaste URL (the last path segment), or null. */
function pasteIdFrom(value: string): string | null {
  const v = value.trim();
  if (!/^https?:\/\//i.test(v)) return null;
  try {
    const seg = new URL(v).pathname
      .replace(/\/raw$/i, '')
      .split('/')
      .filter(Boolean)
      .pop();
    return seg && /^[a-z0-9]+$/i.test(seg) ? seg : null;
  } catch {
    return null;
  }
}

function buildCards(text: string): CardData[] {
  return parseTeam(text).map((set) => {
    const rawSpecies = set.species ?? set.name ?? 'Unknown';
    const { spriteSpecies, displayName, megaAbility } = resolveMega(rawSpecies, set.item);
    const nat = set.nature ? Dex.natures.get(set.nature) : undefined;
    const natureFx =
      nat?.plus && nat?.minus
        ? {
            plus: STAT_LABEL[nat.plus as keyof typeof STAT_LABEL],
            minus: STAT_LABEL[nat.minus as keyof typeof STAT_LABEL],
          }
        : null;
    return {
      set,
      species: displayName,
      spriteSpecies,
      megaAbility: megaAbility && megaAbility !== set.ability ? megaAbility : null,
      natureFx,
      evs: STAT_ORDER.map((k) => [k, set.evs?.[k] ?? 0] as const).filter(([, v]) => v > 0),
    };
  });
}

/** Local animated HOME render, falling back to the Showdown CDN sprite. */
function Sprite({ species }: { species: string }) {
  const cdn = Sprites.getPokemon(species);
  const id = decodeURIComponent(cdn.url.split('/').pop() ?? '').replace(/\.(gif|png|webp)$/i, '');
  const [src, setSrc] = useState(id ? `/sprites/pokemon/${id}.webp` : cdn.url);
  const [pixelated, setPixelated] = useState(id ? false : cdn.pixelated);
  return (
    <img
      src={src}
      alt={species}
      loading="lazy"
      className="max-h-20 max-w-20 object-contain"
      style={{ imageRendering: pixelated ? 'pixelated' : 'auto' }}
      onError={() => {
        if (src !== cdn.url) {
          setSrc(cdn.url);
          setPixelated(cdn.pixelated);
        }
      }}
    />
  );
}

/** Local Serebii item render, falling back to the Showdown sprite-sheet icon. */
function ItemIcon({ item }: { item?: string }) {
  const [failed, setFailed] = useState(false);
  if (!item) return null;
  const id = Dex.items.get(item).id || item.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!failed && id) {
    return (
      <img
        src={`/sprites/items/${id}.png`}
        alt={item}
        title={item}
        loading="lazy"
        className="absolute -bottom-1 -right-1 h-8 w-8 object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
        onError={() => setFailed(true)}
      />
    );
  }
  // The sheet icon comes back as a CSS string; apply it via a ref.
  const sheet = Icons.getItem(item).style as unknown;
  return (
    <span
      className="absolute bottom-0 right-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]"
      title={item}
      aria-label={item}
      ref={(el) => {
        if (!el) return;
        if (typeof sheet === 'string') el.style.cssText += `;${sheet}`;
        else Object.assign(el.style, sheet as CSSProperties);
      }}
    />
  );
}

export default function TeamPreviewTool({ lang }: { lang: Lang }) {
  const t = useTranslations(lang);
  const [input, setInput] = useState('');
  const [cards, setCards] = useState<CardData[] | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Push the shown team into the URL (?paste=<id>) so it can be shared and the
  // back/forward buttons step through previously viewed teams. Skip the push
  // when nothing changed (e.g. resubmitting the same link).
  function pushUrl(id: string | null) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('paste', id);
    else url.searchParams.delete('paste');
    if (url.searchParams.get('paste') !== new URL(window.location.href).searchParams.get('paste')) {
      window.history.pushState(null, '', url);
    }
  }

  async function show(raw: string, push = true) {
    const value = raw.trim();
    if (!value) return;
    setLoading(true);
    setError(false);

    const isUrl = /^https?:\/\//i.test(value);
    const text = isUrl ? await fetchPaste(value) : value;
    const built = text ? buildCards(text) : [];

    setLoading(false);
    if (built.length === 0) {
      setCards(null);
      setSourceUrl(null);
      setError(true);
      return;
    }
    setCards(built);
    setSourceUrl(isUrl ? value.replace(/\/+$/, '').replace(/\/raw$/i, '') : null);
    if (push) pushUrl(pasteIdFrom(value));
  }

  // Render whatever ?paste=<id> the current URL points at, without pushing a new
  // entry (the URL already reflects it). Used on load and on back/forward.
  function loadFromLocation() {
    const id = new URL(window.location.href).searchParams.get('paste');
    if (id && /^[a-z0-9]+$/i.test(id)) {
      const url = `https://pokepast.es/${id}`;
      setInput(url);
      show(url, false);
    } else {
      setCards(null);
      setSourceUrl(null);
      setError(false);
    }
  }

  useEffect(() => {
    loadFromLocation();
    window.addEventListener('popstate', loadFromLocation);
    return () => window.removeEventListener('popstate', loadFromLocation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="pb-16">
      <form
        className="mt-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          show(input);
        }}
      >
        <input
          type="text"
          inputMode="url"
          value={input}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          placeholder={t('team.tool.placeholder')}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-muted/60 focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading}
          className="shrink-0 rounded-lg border border-accent bg-accent px-4 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading ? t('team.tool.loading') : t('team.tool.submit')}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          {t('team.parseError')}
        </p>
      )}

      {cards && (
        <div className="mt-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cards.map(({ set, species, spriteSpecies, megaAbility, natureFx, evs }, i) => (
              <div key={i} className="flex gap-3 rounded-xl border border-border bg-surface p-3">
                <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
                  <Sprite species={spriteSpecies} />
                  <ItemIcon item={set.item} />
                </div>

                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold text-fg">{species}</span>
                    {set.item && <span className="shrink-0 text-xs text-muted">@ {set.item}</span>}
                  </div>

                  {(set.ability || set.teraType) && (
                    <div className="mt-1 flex items-center justify-between gap-x-2 text-xs text-muted">
                      {set.ability && (
                        <span className="min-w-0 truncate">
                          {set.ability}
                          {megaAbility && <span className="text-accent"> ({megaAbility})</span>}
                        </span>
                      )}
                      {set.teraType && (
                        <span className="shrink-0 text-accent" title={`Tera ${set.teraType}`}>
                          {set.teraType}
                        </span>
                      )}
                    </div>
                  )}

                  {set.moves && set.moves.length > 0 && (
                    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-fg/90">
                      {set.moves.map((move, j) => (
                        <li
                          key={j}
                          className="truncate before:mr-1 before:text-accent before:content-['▸']"
                        >
                          {move}
                        </li>
                      ))}
                    </ul>
                  )}

                  {(set.nature || evs.length > 0) && (
                    <div className="mt-2 space-y-0.5 text-[11px] text-muted">
                      {set.nature && (
                        <div className="flex items-baseline gap-1.5">
                          <span>{set.nature}</span>
                          {natureFx && (
                            <span className="font-semibold">
                              <span className="text-green-400">+{natureFx.plus}</span>
                              <span className="ml-1 text-red-400">−{natureFx.minus}</span>
                            </span>
                          )}
                        </div>
                      )}
                      {evs.length > 0 && (
                        <div>{evs.map(([k, v]) => `${v} ${STAT_LABEL[k]}`).join(' / ')}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {sourceUrl && (
            <p className="mt-3 text-xs">
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted transition-colors hover:text-accent"
              >
                {t('team.viewPaste')}
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
