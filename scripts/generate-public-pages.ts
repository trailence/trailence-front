import * as fs from 'node:fs';
import { AvailableLocales } from 'src/app/services/i18n/available-locales';

interface PublicPage {
  name: string;
  i18n?: string;
}

const languages = Object.keys(AvailableLocales);
const pages: PublicPage[] = [{
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

function generateHome(srcIndex: string, dstPath: string, language: string, i18n: any) {
  let dstIndex = fs.readFileSync('../src/app/pages/home/home.page.html', { encoding: 'utf-8' });
  dstIndex = dstIndex.replaceAll('{{lang}}', language);
  dstIndex = dstIndex.replaceAll('{{theme}}', 'DARK');
  dstIndex = dstIndex.replaceAll('{{themeFile}}', 'dark');
  dstIndex = dstIndex.replaceAll('{{ssUrl}}', '/assets/home-ss/ss.3');
  dstIndex = dstIndex.replaceAll('{{imgLocale}}', 'en');
  dstIndex = dstIndex.replaceAll('{{year}}', '' + new Date().getFullYear());

  let i: number = 0;
  while ((i = dstIndex.indexOf('{{i18n.texts.pages.home.', i)) !== -1) {
    const j = dstIndex.indexOf('}}', i);
    const key = dstIndex.substring(i + 24, j);
    const keys = key.split('.');
    let value = i18n.pages.home;
    for (let k = 0; k < keys.length; ++k) value = value[keys[k]];
    if (!value) throw new Error('Unknown key: ' + key);
    dstIndex = dstIndex.substring(0, i) + value + dstIndex.substring(j + 2);
  }

  i = 0;
  while ((i = dstIndex.indexOf('[innerHTML]="i18n.texts.pages.home.', i)) !== -1) {
    const j1 = dstIndex.indexOf('"', i + 35);
    const j2 = dstIndex.indexOf('>', j1);
    const key = dstIndex.substring(i + 35, j1);
    const keys = key.split('.');
    let value = i18n.pages.home;
    for (let k = 0; k < keys.length; ++k) value = value[keys[k]];
    if (!value) throw new Error('Unknown key: ' + key);
    dstIndex = dstIndex.substring(0, i) + '>' + value + dstIndex.substring(j2 + 1);
  }

  i = 0;
  while ((i = dstIndex.indexOf('@let', i)) !== -1) {
    const j = dstIndex.indexOf(';', i);
    dstIndex = dstIndex.substring(0, i) + dstIndex.substring(j + 1);
  }

  i = 0;
  while ((i = dstIndex.indexOf('@if (!isAndroidApp) {', i)) !== -1) {
    const j = dstIndex.indexOf('}<!--endif-->', i);
    dstIndex = dstIndex.substring(0, i) + dstIndex.substring(i + 21, j) + dstIndex.substring(j + 13);
  }

  i = 0;
  while ((i = dstIndex.indexOf('@defer {', i)) !== -1) {
    const j = dstIndex.indexOf('}<!--end defer-->', i);
    dstIndex = dstIndex.substring(0, i) + dstIndex.substring(j + 17);
  }

  i = 0;
  while ((i = dstIndex.indexOf('@if (lang === \'fr\') {', i)) !== -1) {
    const j = dstIndex.indexOf('}<!--endif-->', i);
    dstIndex = dstIndex.substring(0, i) + dstIndex.substring(j + 17);
  }


  i = dstIndex.indexOf('@for (chip of i18n.texts.pages.home.hero.chips; track $index) {');
  let j = dstIndex.indexOf('</span>', i);
  j = dstIndex.indexOf('</span>', j + 1);
  j = dstIndex.indexOf('}', j + 1);
  let content = dstIndex.substring(i + 63, j);
  let newContent = '';
  for (const chip of i18n.pages.home.hero.chips) {
    newContent += content.replace('{{chip}}', chip);
  }
  dstIndex = dstIndex.substring(0, i) + newContent + dstIndex.substring(j + 1);

  i = dstIndex.indexOf('@for (feature of i18n.texts.pages.home.features.and_more.features; track $index) {');
  j = dstIndex.indexOf('}}', i);
  j = dstIndex.indexOf('}', j + 2);
  content = dstIndex.substring(i + 82, j);
  newContent = '';
  for (const feature of i18n.pages.home.features.and_more.features) {
    newContent += content.replace('{{feature}}', feature);
  }
  dstIndex = dstIndex.substring(0, i) + newContent + dstIndex.substring(j + 1);

  dstIndex = srcIndex.replace('<!-- content -->', dstIndex);
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
  generateHome(srcIndex, '../www/browser/index_' + language + '_home.html', language, i18n);
  for (const page of pages) {
    generateIndex(srcIndex, '../www/browser/index_' + language + '_' + page.name + '.html', page, language, i18n);
  }
}
