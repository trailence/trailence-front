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

function listPages() {
  const dir = fs.opendirSync('./src/site/pages');
  let entry;
  const pages = [];
  while ((entry = dir.readSync()) != null) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) pages.push(entry.name);
  }
  dir.closeSync();
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
  fs.writeFileSync('./www/' + lang + '/' + pageName + '.html', page, {encoding: 'utf-8'});
}

copy('./src/static', './www');

const languages = ['en', 'fr'];
const pages = listPages();

for (const lang of languages) {
  fs.mkdirSync('./www/' + lang);
  for (const page of pages) {
    await generatePage(lang, page);
  }
}
