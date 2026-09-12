const fs = require('fs');

function getCurrentVersion() {
  const json = JSON.parse(fs.readFileSync('./package.json', {encoding: 'utf8'}));
  const version = json['version'];
  if (typeof version !== 'string') throw 'Cannot read current version';
  return version;
}
const previousVersion = getCurrentVersion();

console.log('Checking assets versions from ' + previousVersion);

const childProcess = require('child_process');
const excludedDirs = ['src/assets/apk', 'src/assets/icon', 'src/assets/map-layers', 'src/assets/releases'];

let iconsVersion = undefined;

function checkAssets(dir) {
  const localDir = fs.opendirSync('./' + dir);
  try {
    let entry;
    while ((entry = localDir.readSync()) !== null) {
      if (entry.isDirectory()) {
        const subDir = dir + '/' + entry.name;
        if (excludedDirs.indexOf(subDir) >= 0) continue;
        checkAssets(subDir);
      } else {
        const result = childProcess.spawnSync('git', ['diff', previousVersion + ':' + dir + '/' + entry.name, dir + '/' + entry.name]);
        if (result.stdout.byteLength > 0) {
          throw 'File ' + dir + '/' + entry.name + ' is different from version ' + previousVersion;
        }
        console.log(dir + '/' + entry.name + ' matches with previous version: Ok.');
        if (dir === 'src/assets' && entry.name.startsWith('icons.') && entry.name.endsWith('.svg'))
          iconsVersion = entry.name.substring(6, entry.name.length - 4);
      }
    }
  } finally {
    localDir.closeSync();
  }
}

checkAssets('src/assets');
if (!iconsVersion) throw 'Cannot find icons file';

let file = fs.readFileSync('src/app/services/assets/assets.service.ts', 'utf-8');
if (file.indexOf("const ICONS_VERSION = '" + iconsVersion + "';") < 0) throw 'Invalid icons version in assets service';
file = fs.readFileSync('server_pages/src/trail_page_template.html', 'utf-8');
if (file.indexOf("const ICONS_VERSION = '" + iconsVersion + "';") < 0) throw 'Invalid icons version in trail_page_template.html';
