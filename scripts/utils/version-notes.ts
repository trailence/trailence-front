import fs from 'node:fs';

export function extractVersionNote(baseDir: string, versionCode: number, errors: string[]) {
  const json = fs.readFileSync(baseDir + '/src/assets/releases/notes.json', { encoding: 'utf-8'});
  const releases = JSON.parse(json);

  let versionKey = '' + versionCode;
  while (versionKey.length < 6) versionKey = '0' + versionKey;

  if (!releases[versionKey]) {
    errors.push('No release found with key: ' + versionKey);
    return undefined;
  }

  return releases[versionKey];
}
