export interface Language {
  trailenceCode: string;
  isoCode: string;
  englishName: string;
}

export const LANGUAGES: Language[] = [
  {
    trailenceCode: 'en',
    isoCode: 'en-US',
    englishName: 'English',
  }, {
    trailenceCode: 'fr',
    isoCode: 'fr-FR',
    englishName: 'French',
  }, {
    trailenceCode: 'de',
    isoCode: 'de-DE',
    englishName: 'German',
  }, {
    trailenceCode: 'es',
    isoCode: 'es-ES',
    englishName: 'Spanish',
  }, {
    trailenceCode: 'it',
    isoCode: 'it-IT',
    englishName: 'Italian',
  }, {
    trailenceCode: 'pt',
    isoCode: 'pt-PT',
    englishName: 'Italian',
  }, {
    trailenceCode: 'zh',
    isoCode: 'zh-Hans',
    englishName: 'Simplified chinese',
  },
];

export function getLanguage(lang: string): Language {
  const l = LANGUAGES.find(i => i.trailenceCode === lang);
  if (!l) throw new Error('Unknown language: ' + lang);
  return l;
}
