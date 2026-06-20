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
    'home.latest': 'Latest reports',
    'home.empty': 'No reports yet. Coming soon.',
    'home.noMatch': 'No reports match these filters.',
    'report.back': '← All reports',
    'report.fallback':
      'This report isn’t available in English yet. Showing the original version.',
    'footer.text': 'my competitive Pokémon journey',
    'team.viewPaste': 'View full paste on Poképaste →',
    'team.parseError':
      'Couldn’t load this team. Check the link or that it’s a valid Showdown export.',
  },
  de: {
    'site.tagline': 'Mein Weg durch die kompetitive Pokémon-Welt',
    'home.latest': 'Neueste Reports',
    'home.empty': 'Noch keine Reports. Kommt bald.',
    'home.noMatch': 'Keine Reports passen zu diesen Filtern.',
    'report.back': '← Alle Reports',
    'report.fallback':
      'Dieser Report ist noch nicht auf Deutsch verfügbar. Du siehst die englische Version.',
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
