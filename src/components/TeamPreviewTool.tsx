import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { PokemonSet } from '@pkmn/sets';
import { Dex } from '@pkmn/dex';
import { Sprites, Icons } from '@pkmn/img';
import { fetchPaste, parseTeam, resolveMega } from '../lib/pokepaste';
import { hostedSpriteUrl } from '../lib/sprites';
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
  nickname: string | null;
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
      // The Showdown export keeps a nickname in `name`; show it only when it
      // actually differs from the species.
      nickname: set.name && set.name !== set.species ? set.name : null,
      spriteSpecies,
      megaAbility: megaAbility && megaAbility !== set.ability ? megaAbility : null,
      natureFx,
      evs: STAT_ORDER.map((k) => [k, set.evs?.[k] ?? 0] as const).filter(([, v]) => v > 0),
    };
  });
}

/** Local animated HOME render, falling back to the Showdown CDN sprite. */
function Sprite({ species, sizeClass = 'max-h-20 max-w-20' }: { species: string; sizeClass?: string }) {
  const cdn = Sprites.getPokemon(species);
  const id = decodeURIComponent(cdn.url.split('/').pop() ?? '').replace(/\.(gif|png|webp)$/i, '');
  const hosted = hostedSpriteUrl(id);
  const [src, setSrc] = useState(hosted ?? cdn.url);
  const [pixelated, setPixelated] = useState(hosted ? false : cdn.pixelated);
  return (
    <img
      src={src}
      alt={species}
      loading="lazy"
      className={`${sizeClass} object-contain`}
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
function ItemIcon({
  item,
  className = 'absolute -bottom-1 -right-1 h-8 w-8',
}: {
  item?: string;
  className?: string;
}) {
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
        className={`${className} object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]`}
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
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // The paste id currently held in `cards`, so back/forward between the grid and
  // a single mon doesn't refetch the same team.
  const loadedId = useRef<string | null>(null);

  // Push a fresh team into the URL (?paste=<id>) so it can be shared and the
  // back/forward buttons step through previously viewed teams. Drops any stale
  // ?mon and skips the push when nothing changed.
  function pushUrl(id: string | null) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('paste', id);
    else url.searchParams.delete('paste');
    url.searchParams.delete('mon');
    if (url.href !== window.location.href) window.history.pushState(null, '', url);
  }

  async function show(raw: string, push = true) {
    const value = raw.trim();
    if (!value) return;
    setInput(value);
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
    loadedId.current = pasteIdFrom(value);
    // A new team from the form resets to the grid; loadFromLocation keeps the
    // ?mon selection it set before calling us.
    if (push) {
      setSelected(null);
      pushUrl(loadedId.current);
    }
  }

  // Render whatever the current URL points at (?paste=<id>&mon=<index>) without
  // pushing a new entry. Used on load and on back/forward.
  function loadFromLocation() {
    const url = new URL(window.location.href);
    const id = url.searchParams.get('paste');
    const monParam = url.searchParams.get('mon');
    const monIdx = monParam && /^\d+$/.test(monParam) ? Number(monParam) : null;

    if (!id || !/^[a-z0-9]+$/i.test(id)) {
      setCards(null);
      setSourceUrl(null);
      setError(false);
      setSelected(null);
      loadedId.current = null;
      return;
    }

    setSelected(monIdx);
    // Same team already in memory: just switch grid <-> mon, no refetch.
    if (loadedId.current !== id) show(`https://pokepast.es/${id}`, false);
  }

  function openMon(i: number) {
    const url = new URL(window.location.href);
    url.searchParams.set('mon', String(i));
    window.history.pushState(null, '', url);
    setSelected(i);
  }

  function closeMon() {
    const url = new URL(window.location.href);
    url.searchParams.delete('mon');
    window.history.pushState(null, '', url);
    setSelected(null);
  }

  useEffect(() => {
    loadFromLocation();
    window.addEventListener('popstate', loadFromLocation);
    return () => window.removeEventListener('popstate', loadFromLocation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mon = cards && selected !== null ? cards[selected] : null;

  if (mon) {
    return (
      <div className="pb-16">
        <button
          type="button"
          onClick={closeMon}
          className="mt-6 text-sm text-muted transition-colors hover:text-fg"
        >
          {t('team.tool.back')}
        </button>

        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
          {/* Header: sprite + name with the key facts as a compact labelled list. */}
          <div className="flex flex-col items-center gap-5 p-6 sm:flex-row sm:items-center sm:gap-6">
            <div className="relative flex h-36 w-36 shrink-0 items-center justify-center rounded-xl bg-bg">
              <Sprite species={mon.spriteSpecies} sizeClass="max-h-28 max-w-28" />
              <ItemIcon item={mon.set.item} className="absolute bottom-1.5 right-1.5 h-11 w-11" />
            </div>

            <div className="min-w-0 flex-1 text-center sm:text-left">
              <h2 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">
                {mon.species}
              </h2>
              {mon.nickname && <p className="mt-1 text-base text-muted">{mon.nickname}</p>}

              <dl className="mt-4 flex flex-wrap justify-center gap-x-8 gap-y-3 text-left sm:justify-start">
                {mon.set.item && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted/70">
                      {t('team.field.item')}
                    </dt>
                    <dd className="mt-0.5 text-base text-fg">{mon.set.item}</dd>
                  </div>
                )}
                {mon.set.ability && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted/70">
                      {t('team.field.ability')}
                    </dt>
                    <dd className="mt-0.5 text-base text-fg">
                      {mon.set.ability}
                      {mon.megaAbility && <span className="text-accent"> ({mon.megaAbility})</span>}
                    </dd>
                  </div>
                )}
                {mon.set.teraType && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted/70">
                      {t('team.field.tera')}
                    </dt>
                    <dd className="mt-0.5 text-base font-medium text-accent">{mon.set.teraType}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* Moves: full-width chips, two columns on wider screens. */}
          {mon.set.moves && mon.set.moves.length > 0 && (
            <div className="border-t border-border p-6 sm:p-7">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted/70">
                {t('team.field.moves')}
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {mon.set.moves.map((move, j) => (
                  <div
                    key={j}
                    className="rounded-lg border border-border bg-bg px-4 py-3 text-base text-fg before:mr-2 before:text-accent before:content-['▸']"
                  >
                    {move}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Spread: nature + EVs, with the nature's boosted/cut stat coloured. */}
          {(mon.set.nature || mon.evs.length > 0) && (
            <div className="border-t border-border p-6 sm:p-7">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted/70">
                {t('team.field.spread')}
              </h3>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {mon.set.nature && (
                  <span className="rounded-md bg-bg px-3 py-1.5 text-sm font-medium text-fg">
                    {mon.set.nature}
                  </span>
                )}
                {mon.evs.map(([k, v]) => {
                  const label = STAT_LABEL[k];
                  const up = mon.natureFx?.plus === label;
                  const down = mon.natureFx?.minus === label;
                  return (
                    <span
                      key={k}
                      className="rounded-md bg-bg px-3 py-1.5 text-sm tabular-nums text-muted"
                    >
                      <span className="font-semibold text-fg">{v}</span>{' '}
                      <span className={up ? 'text-green-400' : down ? 'text-red-400' : ''}>
                        {label}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

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
              <button
                key={i}
                type="button"
                onClick={() => openMon(i)}
                className="flex gap-3 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-accent"
              >
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
              </button>
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
