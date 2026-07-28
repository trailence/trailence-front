export type LocaleKey = 'de' | 'en' | 'es' | 'fr' | 'it' | 'pt';
export interface LocaleInfo {
  key: LocaleKey;
  displayName: string;
  iconVersion: number;
}

export const AvailableLocales: {[key in LocaleKey]: LocaleInfo} = {
  'de': {
    key: 'de',
    displayName: 'Deutsch',
    iconVersion: 1,
  },
  'en': {
    key: 'en',
    displayName: 'English',
    iconVersion: 1,
  },
  'es': {
    key: 'es',
    displayName: 'Español',
    iconVersion: 1,
  },
  'fr': {
    key: 'fr',
    displayName: 'Français',
    iconVersion: 1,
  },
  'it': {
    key: 'it',
    displayName: 'Italiano',
    iconVersion: 1,
  },
  'pt': {
    key: 'pt',
    displayName: 'Português',
    iconVersion: 1,
  },
};

export const DEFAULT_LOCALE_KEY: LocaleKey = 'en';

export function toLocaleKey(lang: string | undefined | null): LocaleKey | undefined {
  if (!lang) return undefined;
  lang = lang.toLowerCase();
  if (Object.keys(AvailableLocales).includes(lang)) return lang as LocaleKey;
  return undefined;
}
