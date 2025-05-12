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
      }
    }
  } finally {
    localDir.closeSync();
  }
}

checkAssets('src/assets');
