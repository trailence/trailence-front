const fs = require('fs');

if (process.argv.length < 3) {
  console.log('Usage: check-release-note <major>.<minor>.<fix>');
  console.log('No version found.')
  throw new Error('No version found: invalid usage');
}

const versionStr = process.argv[2];
const versionRegexp = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const version = versionStr.match(versionRegexp);
if (!version) {
  console.log('Invalid version: ', versionStr);
  throw new Error('Invalid version: ' + versionStr);
}
const major = parseInt(version[1]);
const minor = parseInt(version[2]);
const fix = parseInt(version[3]);

console.log('Checking release note for version: ', versionStr);

const versionCode = fix + minor * 100 + major * 10000;
const knownLanguages = ['en', 'fr'];

const json = fs.readFileSync('./src/assets/releases/notes.json', { encoding: 'utf-8'});
const releases = JSON.parse(json);

let versionKey = '' + versionCode;
while (versionKey.length < 6) versionKey = '0' + versionKey;

if (!releases[versionKey]) {
  throw new Error('No release found with key: ' + versionKey);
}

const release = releases[versionKey];
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
