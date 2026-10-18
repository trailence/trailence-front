import fs from 'node:fs';
import childProcess from 'node:child_process';

function getCurrentVersion(baseDir: string, errors: string[]): string | undefined {
  const json = JSON.parse(fs.readFileSync(baseDir + '/package.json', {encoding: 'utf8'}));
  const version = json['version'];
  if (typeof version !== 'string') {
    errors.push('Cannot read current assets version');
    return undefined;
  }
  return version;
}

const excludedDirs = ['src/assets/apk', 'src/assets/icon', 'src/assets/map-layers', 'src/assets/releases'];

function checkAssets(dir: string, previousVersion: string, errors: string[]): string | undefined {
  let iconsVersion: string | undefined = undefined;
  const localDir = fs.opendirSync(dir);
  try {
    let entry;
    while ((entry = localDir.readSync()) !== null) {
      if (entry.isDirectory()) {
        const subDir = dir + '/' + entry.name;
        if (excludedDirs.indexOf(subDir) >= 0) continue;
        const icons = checkAssets(subDir, previousVersion, errors);
        if (!iconsVersion && icons) iconsVersion = icons;
      } else {
        const result = childProcess.spawnSync('git', ['diff', previousVersion + ':' + dir + '/' + entry.name, dir + '/' + entry.name]);
        if (result.stdout.byteLength > 0) {
          errors.push('File ' + dir + '/' + entry.name + ' is different from version ' + previousVersion);
        }
        if (dir.endsWith('/src/assets') && entry.name.startsWith('icons.') && entry.name.endsWith('.svg'))
          iconsVersion = entry.name.substring(6, entry.name.length - 4);
      }
    }
  } finally {
    localDir.closeSync();
  }
  return iconsVersion;
}

export function checkAssetsVersion(baseDir: string, errors: string[]) {
  const previousVersion = getCurrentVersion(baseDir, errors);
  if (!previousVersion) return;

  console.log('Checking assets versions from ' + previousVersion);

  const iconsVersion = checkAssets(baseDir + '/src/assets', previousVersion, errors);

  if (!iconsVersion) {
    errors.push('Cannot find icons file');
    return;
  }

  let file = fs.readFileSync(baseDir + '/src/app/services/assets/assets.service.ts', 'utf-8');
  if (file.indexOf("const ICONS_VERSION = '" + iconsVersion + "';") < 0) errors.push('Invalid icons version in assets service');
  file = fs.readFileSync(baseDir + '/server_pages/src/trail_page_template.html', 'utf-8');
  if (file.indexOf("const ICONS_VERSION = '" + iconsVersion + "';") < 0) errors.push('Invalid icons version in trail_page_template.html');
}
