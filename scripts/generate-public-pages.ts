import * as fs from 'fs';

interface PublicPage {
  name: string;
  i18n?: string;
}

const languages = ['en', 'fr'];
const pages: PublicPage[] = [{
  name: 'home'
}, {
  name: 'login'
}, {
  name: 'register'
}, {
  name: 'donation'
}, {
  name: 'contact'
}, {
  name: 'install-apk',
  i18n: 'installApk',
}];

function generateIndex(srcIndex: string, dstPath: string, page: PublicPage, language: string, i18n: any) {
  const title = i18n.pages[page.i18n ?? page.name].title;
  if (!title) throw new Error('Cannot find title for page ' + page.name + ' language ' + language);
  const description = i18n.pages[page.i18n ?? page.name].meta_description;
  if (!description) throw new Error('Cannot find meta_description for page ' + page.name + ' language ' + language);

  let dstIndex = srcIndex;
  dstIndex = dstIndex.replace('<html lang="en"', '<html lang="' + language + '"');
  let i = dstIndex.indexOf('<meta id="head_meta_description"');
  i = dstIndex.indexOf('content="', i);
  let j = dstIndex.indexOf('"', i + 9);
  dstIndex = dstIndex.substring(0, i + 9) + description + dstIndex.substring(j);

  dstIndex = dstIndex.replace('<title>Trailence</title>', '<title>' + title + '</title>');
  dstIndex = dstIndex.replace('<!-- content -->', '<h1>' + title + '</h1><h2>' + description + '</h2>');

  fs.writeFileSync(dstPath, dstIndex);
}

function readIndex(): string {
  return fs.readFileSync('../www/browser/index.html', { encoding: 'utf-8' });
}

function loadI18n(language: string): any {
  const dir = fs.opendirSync('../src/assets/i18n');
  let i18n: any = undefined;
  try {
    let entry;
    while ((entry = dir.readSync()) !== null) {
      if (entry.name.startsWith(language + '.') && entry.name.endsWith('.json')) {
        const text = fs.readFileSync('../src/assets/i18n/' + entry.name, { encoding: 'utf-8' });
        const json = JSON.parse(text);
        i18n = json;
        break;
      }
    }
  } finally {
    dir.closeSync();
  }
  if (!i18n) throw new Error('Cannot find i18n file for language ' + language);
  return i18n;
}

const srcIndex = readIndex();
for (const language of languages) {
  const i18n = loadI18n(language);
  for (const page of pages) {
    generateIndex(srcIndex, '../www/browser/index_' + language + '_' + page.name + '.html', page, language, i18n);
  }
}
