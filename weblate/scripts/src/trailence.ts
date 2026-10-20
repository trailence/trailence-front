import fs from 'node:fs';
import path from 'node:path';

export function findI18nFile(i18nDir: string, language: string): string {
  const dir = fs.opendirSync(i18nDir);
  const prefix = language + '.';
  let entry: fs.Dirent<string> | null;
  while ((entry = dir.readSync()) !== null) {
    if (entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith('.json')) break;
  }
  if (!entry) throw new Error('Cannot find i18n file ' + language + ' in ' + i18nDir);
  const filename = path.join(i18nDir, entry.name);
  dir.closeSync();
  return filename;
}
