import fs from 'fs';
import generator from './generate_page.js';

function copy(src, dst) {
  console.log('Copy <' + src + '> to <' + dst + '>');
  if (fs.existsSync(dst)) fs.rmSync(dst, {recursive: true});
  fs.mkdirSync(dst);
  const dir = fs.opendirSync(src);
  let entry;
  while ((entry = dir.readSync()) != null) {
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.')) copy(src + '/' + entry.name, dst + '/' + entry.name);
    } else {
      fs.copyFileSync(src + '/' + entry.name, dst + '/' + entry.name);
    }
  }
  dir.closeSync();
}

function listPagesRecursive(path, name, pages) {
  const dir = fs.opendirSync(path);
  let entry;
  let foundHere = false;
  const thisEndName = name.length === 0 ? undefined : (name.lastIndexOf('/') > 0 ? name.substring(name.lastIndexOf('/') + 1) : name);
  while ((entry = dir.readSync()) != null) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      listPagesRecursive(path + '/' + entry.name, (name.length > 0 ? name + '/' : '') + entry.name, pages);
    } else if (!foundHere && thisEndName && entry.name.startsWith(thisEndName) && entry.name.endsWith('.html')) {
      foundHere = true;
      pages.push(name);
    }
  }
  dir.closeSync();
}

function listPages() {
  const pages = [];
  listPagesRecursive('./src/site/pages', '', pages);
  return pages;
}

function readFile(path) {
  return fs.promises.readFile('./src/' + path, {encoding: 'utf-8'})
  .catch(e => {
    throw new Error('Read file ' + path + ': ' + e);
  });
}

async function generatePage(lang, pageName) {
  console.log('Generate page /' + lang + '/' + pageName);
  const page = await generator.generatePage(lang, pageName, readFile);
  let i = pageName.lastIndexOf('/');
  let pagePath, endName;
  if (i > 0) {
    pagePath = pageName.substring(0, i);
    endName = pageName.substring(i + 1);
  } else {
    pagePath = '';
    endName = pageName;
  }
  const dir = './www/' + lang + '/' + pagePath;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(dir + '/' + endName + '.html', page, {encoding: 'utf-8'});
}

function releaseNoteToHtml(code, content) {
  let html = '<div class="release_version">';
  html += '<div class="version_header">';
  html += '<div class="version_code">' + code + '</div>';
  if (content.message) html += '<div class="version_message">' + content.message + '</div>';
  html += '</div>';
  if (content.items) {
    html += '<ul>';
    for (const item of content.items) html += '<li>' + item + '</li>';
    html += '</ul>';
  }
  html += '</div>';
  return html;
}

async function generateReleaseNotes() {
  const notesRaw = fs.readFileSync('../src/assets/releases/notes.json', {encoding: 'utf-8'});
  const notes = JSON.parse(notesRaw);
  const versions = [];
  for (const v of Object.keys(notes)) {
    const num = parseInt(v);
    const code = Math.floor(v / 10000) + '.' + Math.floor((v % 10000) / 100) + '.' + (v % 100);
    versions.push({num, code, ...notes[v]});
  }
  versions.sort(function (v1, v2) { return v2.num - v1.num; });
  let htmlFr = "";
  let htmlEn = "";
  for (const v of versions) {
    htmlFr += releaseNoteToHtml(v.code, v.fr);
    htmlEn += releaseNoteToHtml(v.code, v.en);
  }
  const indexHtml = await readFile('site/index.html');
  fs.writeFileSync('./www/en/release_notes.html', await generator.generateIndexHtml('en', 'release_notes', indexHtml, await readFile('site/menu.en.html'), htmlEn, {title: "Trailence Releases"}, readFile), {encoding: 'utf-8'});
  fs.writeFileSync('./www/fr/release_notes.html', await generator.generateIndexHtml('fr', 'release_notes', indexHtml, await readFile('site/menu.fr.html'), htmlFr, {title: "Versions de Trailence"}, readFile), {encoding: 'utf-8'});
}

copy('./src/static', './www');
fs.copyFileSync('./src/default.html', './www/index.html');

const languages = ['en', 'fr'];
const pages = listPages();
console.log('Pages found: ' + pages.length);

for (const lang of languages) {
  fs.mkdirSync('./www/' + lang);
  for (const page of pages) {
    await generatePage(lang, page);
  }
}
await generateReleaseNotes();
