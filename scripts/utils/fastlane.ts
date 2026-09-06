import { AvailableLocales } from '@trailence/services/i18n/available-locales';

export const knownLanguages = Object.keys(AvailableLocales);
export const fastlaneLanguages = {
  'de': 'de-DE',
  'en': 'en-US',
  'fr': 'fr-FR',
  'es': 'es-ES',
  'it': 'it',
  'pt': 'pt-PT',
}
if (Object.keys(knownLanguages).length !== Object.keys(fastlaneLanguages).length)
  throw new Error('Fastlane languages count does not match with available locales');
for (const lang of knownLanguages)
  if (!(fastlaneLanguages as any)[lang]) throw new Error('Fastlane language unknown for lang ' + lang);
