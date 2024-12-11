const child_process = require('child_process');
const fs = require('fs');

if (process.argv.length < 3) {
  console.log('Usage: set-version <major>.<minor>.<fix>');
  console.log('No version found.')
  return 1;
}

const versionStr = process.argv[2];
const versionRegexp = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const version = versionStr.match(versionRegexp);
if (!version) {
  console.log('Invalid version: ', versionStr);
  return 1;
}
const major = parseInt(version[1]);
const minor = parseInt(version[2]);
const fix = parseInt(version[3]);

console.log('Version: ', versionStr);

const versionCode = fix + minor * 100 + major * 10000;

console.log('Code: ', versionCode);

console.log('Updating version in package.json');
child_process.execSync('npm version ' + versionStr + ' --allow-same-version=true --commit-hooks=false --no-git-tag-version --force');

console.log('Updating version in wep app');
fs.writeFileSync(
  'src/app/trailence-version.ts',
  'export const trailenceAppVersionName="' + versionStr + '";\n' +
  'export const trailenceAppVersionCode=' + versionCode + ';\n'
);

console.log('Updating version in android app');
fs.writeFileSync(
  'android/version.gradle',
  'ext {\n' +
  '  versionCode = ' + versionCode + '\n' +
  '  versionName = \'' + versionStr + '\'\n' +
  '}\n'
);

console.log('Updating version in index.html');
let index = fs.readFileSync('src/index.html', {encoding: 'utf-8'});
let i = index.indexOf('<div id="trailence-version">');
let j = index.indexOf('</div>', i);
index = index.substring(0, i + 28) + versionStr + index.substring(j);
fs.writeFileSync('src/index.html', index);

console.log('Updating version in sonar properties');
let sonar = fs.readFileSync('sonar-project.properties', {encoding: 'utf-8'});
i = sonar.indexOf('sonar.version=');
j = sonar.indexOf('\n', i);
sonar = sonar.substring(0, i + 14) + versionStr + sonar.substring(j);
fs.writeFileSync('sonar-project.properties', sonar);

console.log('Successfully updated version to ', versionStr);
