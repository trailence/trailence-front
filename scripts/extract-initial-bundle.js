const fs = require('fs');

if (process.argv.length < 3) {
  console.log('Usage: extract-initial-bundle <input>');
  return 1;
}

const inputFilename = process.argv[2];
let input = fs.readFileSync(inputFilename, {encoding: 'utf8'});

let i = input.indexOf('Initial chunk files');
let j = input.indexOf('\n', i);
input = input.substring(j + 1);

i = input.indexOf('Initial total');
j = input.lastIndexOf('\n', i);
input = input.substring(0, j);
const lines = input.split('\n');

const initialFiles = [];

for (const line of lines) {
  i = line.indexOf('[39m');
  if (i < 0) continue;
  let filename = line.substring(0, i);
  if (!filename.startsWith('[32m')) continue;
  filename = filename.substring('[32m'.length);
  initialFiles.push('www/browser/' + filename);
}

if (initialFiles.length === 0) throw Error('Cannot find initial bundle files');

const cmd = initialFiles.join(' ');
console.log('Initial bundle: ' + cmd);

const child_process = require('child_process');
child_process.execSync('source-map-explorer ' + cmd);
