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
