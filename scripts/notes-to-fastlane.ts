import fs from 'node:fs';
import { fastlaneLanguages, knownLanguages } from './utils/fastlane';
import { versionNameToVersionCode } from './utils/parse-version';
import { extractVersionNote } from './utils/version-notes';

const versionCode = versionNameToVersionCode(process.argv[2]);
const release = extractVersionNote(versionCode);

for (const lang of knownLanguages) {
  const fastLaneLang = (fastlaneLanguages as any)[lang];
  const items = release[lang].items;
  if (!items) throw new Error('Missing items for lang ' + lang);
  const lines = items.join('\n');
  fs.writeFileSync('./fastlane/metadata/android/' + fastLaneLang + '/changelogs/' + versionCode + '.txt', lines, {encoding: 'utf-8'});
}
