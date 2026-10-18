import fs from 'node:fs';
import { fastlaneLanguages, knownLanguages } from '@utils/fastlane';
import { versionNameToVersionCode } from '@utils/parse-version';
import { extractVersionNote } from '@utils/version-notes';

export function checkReleaseNotes(baseDir: string, version: string, errors: string[]) {
  console.log('Checking release note for version: ', version);
  const versionCode = versionNameToVersionCode(version);

  const release = extractVersionNote(baseDir, versionCode, errors);
  if (!release) return;
  for (const lang of knownLanguages) {
    if (!release[lang]) {
      errors.push('Language ' + lang + ' not found in release note');
    }
  }
  const messageEn = release['en']['message'];
  const itemsEn = release['en']['items'];
  for (const lang of knownLanguages) {
    if (lang === 'en') continue;
    const r = release[lang];
    if (messageEn && !r['message']) errors.push('Missing message for language ' + lang);
    else if (!messageEn && r['message']) errors.push('Message found for language ' + lang + ' but missing for en');
    else if ((itemsEn && (!r['items'] || r['items'].length !== itemsEn.length)) || (!itemsEn && r['items'])) errors.push('Items do not match between en and ' + lang);
  }

  for (const lang of Object.values(fastlaneLanguages)) {
    if (!fs.existsSync(baseDir + '/fastlane/metadata/android/' + lang + '/changelogs/' + versionCode + '.txt'))
      errors.push('Missing release note for fastlane language ' + lang);
  }
}
