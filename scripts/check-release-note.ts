const fs = require('fs');
import { AvailableLocales } from '../src/app/services/i18n/available-locales';
import { fastlaneLanguages, knownLanguages } from './utils/fastlane';
import { versionNameToVersionCode } from './utils/parse-version';
import { extractVersionNote } from './utils/version-notes';

if (process.argv.length < 3) {
  console.log('Usage: check-release-note <major>.<minor>.<fix>');
  console.log('No version found.')
  throw new Error('No version found: invalid usage');
}

console.log('Checking release note for version: ', process.argv[2]);
const versionCode = versionNameToVersionCode(process.argv[2]);

const release = extractVersionNote(versionCode);
for (const lang of knownLanguages) {
  if (!release[lang]) {
    throw new Error('Language ' + lang + ' not found in release note');
  }
}
const messageEn = release['en']['message'];
const itemsEn = release['en']['items'];
for (const lang of knownLanguages) {
  if (lang === 'en') continue;
  const r = release[lang];
  if (messageEn && !r['message']) throw new Error('Missing message for language ' + lang);
  if (!messageEn && r['message']) throw new Error('Message found for language ' + lang + ' but missing for en');
  if ((itemsEn && (!r['items'] || r['items'].length !== itemsEn.length)) || (!itemsEn && r['items'])) throw new Error('Items do not match between en and ' + lang);
}

for (const lang of Object.values(fastlaneLanguages)) {
  if (!fs.existsSync('./fastlane/metadata/android/' + lang + '/changelogs/' + versionCode + '.txt'))
    throw new Error('Missing release note for fastlane language ' + lang);
}
