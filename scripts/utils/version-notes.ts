import fs from 'node:fs';

export function extractVersionNote(versionCode: number) {
  const json = fs.readFileSync('./src/assets/releases/notes.json', { encoding: 'utf-8'});
  const releases = JSON.parse(json);

  let versionKey = '' + versionCode;
  while (versionKey.length < 6) versionKey = '0' + versionKey;

  if (!releases[versionKey]) {
    throw new Error('No release found with key: ' + versionKey);
  }

  return releases[versionKey];
}
