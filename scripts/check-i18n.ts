const fs = require('fs');
const jsdom = require('jsdom');
import { AvailableLocales, LocaleKey } from '../src/app/services/i18n/available-locales';

const knownLanguages = Object.keys(AvailableLocales);

function readI18nDir(path: string, withFlagsIcons: boolean, checkJsonVersion: (version: number) => void, knownLanguages: string[]) {
  const languages = new Map();
  const dir = fs.opendirSync(path);
  try {
    let entry;
    while ((entry = dir.readSync()) !== null) {
      if (entry.name.startsWith('languages.') && entry.name.endsWith('.json')) continue;
      const i = entry.name.indexOf('.');
      const j = entry.name.lastIndexOf('.');
      if (i < 0 || j < 0) throw 'Unexpected file: ' + entry.name;
      const lang = entry.name.substring(0, i);
      const extension = entry.name.substring(j + 1);
      const version = parseInt(entry.name.substring(i + 1, j));
      if (knownLanguages.indexOf(lang) < 0) throw 'Unknown language file: ' + entry.name;
      if (extension !== 'json' && extension !== 'svg') throw 'Unexpected file: ' + entry.name;
      if (isNaN(version) || ('' + version) !== entry.name.substring(i + 1, j) || version < 1) throw 'Unexpected file: ' + entry.name;
      let l = languages.get(lang);
      if (!l) l = {'language': lang};
      if (!l.files) l.files = new Object();
      if (l.files[extension]) throw 'Several files with extension ' + extension + ' for language ' + lang;
      l.files[extension] = entry.name;
      if (!l.versions) l.versions = new Object();
      l.versions[extension] = version;
      languages.set(lang, l);
    }
  } finally {
    dir.closeSync();
  }

  for (const l of knownLanguages) if (!languages.get(l)) throw 'Language not found: ' + l + ' in ' + path;
  let jsonVersion: number | undefined;
  for (const l of languages.values()) {
    if (!l.files['json']) throw 'Missing json file for language ' + l.language;
    if (!l.files['svg'] && withFlagsIcons) throw 'Missing svg file for language ' + l.language;
    if (!l.versions['json']) throw 'No version for json file ' + l.language;
    if (withFlagsIcons) {
      if (!l.versions['svg']) throw 'No version for svg file ' + l.language;
      if (l.versions['svg'] != AvailableLocales[l.language as LocaleKey].iconVersion) throw 'Flag for language ' + l.language + ' is declared with version ' + AvailableLocales[l.language as LocaleKey].iconVersion + ' but found is ' + l.versions['svg'];
    }
    if (jsonVersion === undefined) jsonVersion = l.versions['json'];
    else if (jsonVersion !== l.versions['json']) throw 'JSON files have different versions: ' + jsonVersion + ', ' + l.versions['json'];
  }
  if (checkJsonVersion) checkJsonVersion(jsonVersion!);

  return languages;
}

function checkKeys(object1: any, object2: any, lang1: string, lang2: string, path: string, dirname: string) {
  for (const k of Object.keys(object1)) {
    if (k === lang2) continue;
    const v = object1[k];
    if (object2[k] === undefined) throw 'Directory' + dirname + ': Key ' + path + '/' + k + ' present in ' + lang1 + ' is missing in ' + lang2;
    const v2 = object2[k];
    if (typeof v !== typeof v2) throw 'Directory' + dirname + ': Key ' + path + '/' + k + ' in lang1 is a ' + (typeof v) + ' but is a ' + (typeof v2) + ' in ' + lang2;
    if (typeof v === 'string') continue;
    checkKeys(v, v2, lang1, lang2, path + '/' + k, dirname);
  }
}

function checkDir(dir: string, withFlagsIcons: boolean, checkJsonVersion: (version: number) => void, knownLanguages: string[]) {
  const languages = readI18nDir(dir, withFlagsIcons, checkJsonVersion, knownLanguages);
  for (const l of languages.values()) {
    const json = JSON.parse(fs.readFileSync(dir + '/' + l.language + '.' + l.versions['json'] + '.json', { encoding: 'utf-8'}));
    l['jsonContent'] = json;
  }

  for (const l1 of languages.values()) {
    for (const l2 of languages.values()) {
      if (l1.language === l2.language) continue;
      checkKeys(l1['jsonContent'], l2['jsonContent'], l1.language, l2.language, '', dir);
      console.log('json from ' + l1.language + ' is valid against ' + l2.language);
    }
  }
}

function checkJsonVersionI18n(version: number) {
  let file = fs.readFileSync('./src/app/services/i18n/i18n.service.ts', 'utf-8');
  if (file.indexOf("const TEXTS_VERSION = '" + version + "';") < 0) throw 'TEXTS_VERSION is invalid in i18n service';
  file = fs.readFileSync('./server_pages/src/generate_trail_page.js', 'utf-8');
  if (file.indexOf("const TEXTS_VERSION = '" + version + "';") < 0) throw 'TEXTS_VERSION is invalid in generate_trail_page.js';
}

function checkJsonVersionI18nAdmin(version: number) {
  let file = fs.readFileSync('./src/app/admin/services/i18n-admin.service.ts', 'utf-8');
  if (file.indexOf("const TEXTS_VERSION = '" + version + "';") < 0) throw 'TEXTS_VERSION is invalid in i18n admin service';
}

function checkNginxLocales(file: string, includePublicPages: boolean) {
  let content = fs.readFileSync(file, 'utf-8');
  let i = content.indexOf(')/trail/');
  if (i < 0) throw Error('Cannot find path for ^<locale>/trail/ in ' + file);
  let j = content.lastIndexOf('(', i);
  let langs = content.substring(j + 1, i).split('|');
  for (const lang of langs) {
    if (!knownLanguages.includes(lang)) throw Error('Unknown language ' + lang + ' in ' + file);
  }
  for (const lang of knownLanguages) {
    if (!langs.includes(lang)) throw new Error('Missing language ' + lang + ' in ' + file);
  }

  if (includePublicPages) {
    i = content.indexOf(')/([a-z\\-]+)$');
    if (i < 0) throw Error('Cannot find path for ^<locale>/([a-z\\-]+)$ in ' + file);
    j = content.lastIndexOf('(', i);
    langs = content.substring(j + 1, i).split('|');
    for (const lang of langs) {
      if (!knownLanguages.includes(lang)) throw Error('Unknown language ' + lang + ' in ' + file);
    }
    for (const lang of knownLanguages) {
      if (!langs.includes(lang)) throw new Error('Missing language ' + lang + ' in ' + file);
    }
  }
}

function checkSitemap() {
  const sitemap = new jsdom.JSDOM(fs.readFileSync('./site/sitemap-base.xml', 'utf-8'), {contentType: 'application/xml'}).window.document.querySelector('urlset');
  const expected: string[] = [];
  const found: string[] = [];
  for (let i = 0; i < sitemap.children.length; ++i) {
    const url = sitemap.children.item(i)!
    const loc = url.getElementsByTagName('loc')[0];
    const locValue = loc.childNodes.item(0).nodeValue;
    found.push(locValue);
    const links = url.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'link');
    if (links.length === 0) continue;
    const langs = [];
    for (let j = 0; j < links.length; ++j) {
      const link = links.item(j)!;
      const lang = link.getAttribute('hreflang');
      if (lang && lang !== 'x-default') {
        langs.push(lang);
        expected.push(link.getAttribute("href"));
      }
    }
    for (const lang of langs) {
      if (!knownLanguages.includes(lang)) throw Error('Unknown language ' + lang + ' in sitemap-base.xml for url ' + locValue);
    }
    for (const lang of knownLanguages) {
      if (!langs.includes(lang)) throw new Error('Missing language ' + lang + ' in sitemap-base.xml for url ' + locValue);
    }
  }
  for (const e of expected)
    if (!found.includes(e)) throw Error('Expected URL ' + e + ' not found in staemap-base.xml');
}

checkNginxLocales('./docker/default.conf.template', true);
checkNginxLocales('./docker/local/context/default.conf.template', true);
checkNginxLocales('./server_pages/test/default.conf.template', false);
checkSitemap();
checkDir('./src/assets/i18n', true, checkJsonVersionI18n, knownLanguages);
checkDir('./src/assets/admin/i18n', false, checkJsonVersionI18nAdmin, ['en', 'fr']);
