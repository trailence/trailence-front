const fs = require('fs');

const knownLanguages = ['en', 'fr'];

function readI18nDir(path, withFlagsIcons, checkJsonVersion) {
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
      if (extension !== 'json' && extension !== 'png') throw 'Unexpected file: ' + entry.name;
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

  for (const l of knownLanguages) if (!languages.get(l)) throw 'Language not found: ' + l;
  let jsonVersion = undefined;
  for (const l of languages.values()) {
    if (!l.files['json']) throw 'Missing json file for language ' + l.language;
    if (!l.files['png'] && withFlagsIcons) throw 'Missing png file for language ' + l.language;
    if (!l.versions['json']) throw 'No version for json file';
    if (jsonVersion === undefined) jsonVersion = l.versions['json'];
    else if (jsonVersion !== l.versions['json']) throw 'JSON files have different versions: ' + jsonVersion + ', ' + l.versions['json'];
  }
  if (checkJsonVersion) checkJsonVersion(jsonVersion);

  return languages;
}

function checkKeys(object1, object2, lang1, lang2, path, dirname) {
  for (const k of Object.keys(object1)) {
    if (k.startsWith('translated_from_')) continue;
    const v = object1[k];
    if (object2[k] === undefined) throw 'Directory' + dirname + ': Key ' + path + '/' + k + ' present in ' + lang1 + ' is missing in ' + lang2;
    const v2 = object2[k];
    if (typeof v !== typeof v2) throw 'Directory' + dirname + ': Key ' + path + '/' + k + ' in lang1 is a ' + (typeof v) + ' but is a ' + (typeof v2) + ' in ' + lang2;
    if (typeof v === 'string') continue;
    checkKeys(v, v2, lang1, lang2, path + '/' + k, dirname);
  }
}

function checkDir(dir, withFlagsIcons, checkJsonVersion) {
  const languages = readI18nDir(dir, withFlagsIcons, checkJsonVersion);
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

function checkJsonVersionI18n(version) {
  let file = fs.readFileSync('./src/app/services/i18n/i18n.service.ts', 'utf-8');
  if (file.indexOf("const TEXTS_VERSION = '" + version + "';") < 0) throw 'TEXTS_VERSION is invalid in i18n service';
  file = fs.readFileSync('./server_pages/src/generate_trail_page.js', 'utf-8');
  if (file.indexOf("const TEXTS_VERSION = '" + version + "';") < 0) throw 'TEXTS_VERSION is invalid in generate_trail_page.js';
}

function checkJsonVersionI18nAdmin(version) {
  let file = fs.readFileSync('./src/app/admin/services/i18n-admin.service.ts', 'utf-8');
  if (file.indexOf("const TEXTS_VERSION = '" + version + "';") < 0) throw 'TEXTS_VERSION is invalid in i18n admin service';
}

checkDir('./src/assets/i18n', true, checkJsonVersionI18n);
checkDir('./src/assets/admin/i18n', false, checkJsonVersionI18nAdmin);
