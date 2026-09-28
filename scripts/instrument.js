const fs = require('node:fs');
const child_process = require('node:child_process');

const excludeSrc = [
  'polyfill.ts',
  'zone-flags.ts'
];

async function checkMap(mapFilename) {
  const file = await fs.promises.readFile('www/browser/' + mapFilename, {encoding: 'utf-8'});
  const i = file.indexOf('"sources":');
  if (i < 0) return undefined;
  const j = file.indexOf(']', i);
  if (j < 0) return undefined;
  try {
    const sources = JSON.parse(file.substring(i + 10, j + 1).trim());
    for (const src of sources) {
      if (src.startsWith('src/') && !excludeSrc.includes(src.substring(4))) return undefined;
    }
    return mapFilename.substring(0, mapFilename.length - 4); // remove the '.map'
  } catch (_) {
    return undefined;
  }
}

const promises = [];

const dir = fs.opendirSync('www/browser');
let entry;
while ((entry = dir.readSync()) !== null) {
  if (entry.isFile() && entry.name.endsWith('.map'))
    promises.push(checkMap(entry.name));
}
dir.closeSync();

Promise.all(promises)
.then(result => {
  const exclude = result.filter(map => !!map);
  //console.log(exclude.join('\n'));
  console.log('Instrument ' + (result.length - exclude.length) + '/' + result.length + ' source files');
  child_process.execSync('npx nyc instrument www/browser www/browser --exclude-after-remap=false --complete-copy --in-place --exclude=**/*.mjs --exclude=**/assets/*.js ' + exclude.map(m => '--exclude=**/' + m).join(' '));
  console.log('Instrument done.');
});
