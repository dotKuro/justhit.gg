export const languages = {
  en: 'English',
  de: 'Deutsch',
} as const;

export type Lang = keyof typeof languages;
export const defaultLang: Lang = 'en';

/** Locale tags for Intl date formatting. */
export const dateLocale: Record<Lang, string> = {
  en: 'en-US',
  de: 'de-DE',
};

export const ui = {
  en: {
    'site.tagline': 'Documenting my competitive Pokémon journey',
    'home.latest': 'Latest posts',
    'home.empty': 'No posts yet. Coming soon.',
    'home.noMatch': 'No posts match these filters.',
    'type.report': 'Report',
    'type.article': 'Article',
    'nav.back': '← All posts',
    'nav.teamPreview': 'Team preview',
    'team.tool.title': 'Team preview',
    'team.tool.intro': 'Paste a Poképaste link to see the whole team at a glance.',
    'team.tool.placeholder': 'https://pokepast.es/…',
    'team.tool.submit': 'Show team',
    'team.tool.loading': 'Loading…',
    'team.tool.back': '← Back to team',
    'team.field.item': 'Item',
    'team.field.ability': 'Ability',
    'team.field.tera': 'Tera',
    'team.field.moves': 'Moves',
    'team.field.spread': 'Spread',
    'report.fallback':
      'This report isn’t available in English yet. Showing the original version.',
    'article.fallback':
      'This article isn’t available in English yet. Showing the original version.',
    'article.viewTool': 'Open the tool →',
    'footer.text': 'my competitive Pokémon journey',
    'team.viewPaste': 'View full paste on Poképaste →',
    'team.parseError':
      'Couldn’t load this team. Check the link or that it’s a valid Showdown export.',
  },
  de: {
    'site.tagline': 'Mein Weg durch die kompetitive Pokémon-Welt',
    'home.latest': 'Neueste Beiträge',
    'home.empty': 'Noch keine Beiträge. Kommt bald.',
    'home.noMatch': 'Keine Beiträge passen zu diesen Filtern.',
    'type.report': 'Report',
    'type.article': 'Artikel',
    'nav.back': '← Alle Beiträge',
    'nav.teamPreview': 'Team-Vorschau',
    'team.tool.title': 'Team-Vorschau',
    'team.tool.intro': 'Füge einen Poképaste-Link ein, um das ganze Team auf einen Blick zu sehen.',
    'team.tool.placeholder': 'https://pokepast.es/…',
    'team.tool.submit': 'Team anzeigen',
    'team.tool.loading': 'Lädt…',
    'team.tool.back': '← Zurück zum Team',
    'team.field.item': 'Item',
    'team.field.ability': 'Fähigkeit',
    'team.field.tera': 'Tera',
    'team.field.moves': 'Attacken',
    'team.field.spread': 'Spread',
    'report.fallback':
      'Dieser Report ist noch nicht auf Deutsch verfügbar. Du siehst die englische Version.',
    'article.fallback':
      'Dieser Artikel ist noch nicht auf Deutsch verfügbar. Du siehst die englische Version.',
    'article.viewTool': 'Tool öffnen →',
    'footer.text': 'meine kompetitive Pokémon-Reise',
    'team.viewPaste': 'Vollständige Paste auf Poképaste ansehen →',
    'team.parseError':
      'Dieses Team konnte nicht geladen werden. Prüfe den Link oder ob es ein gültiger Showdown-Export ist.',
  },
} as const;

export type UIKey = keyof (typeof ui)['en'];

export function useTranslations(lang: Lang) {
  return function t(key: UIKey): string {
    return ui[lang]?.[key] ?? ui[defaultLang][key];
  };
}

export function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'de';
}
