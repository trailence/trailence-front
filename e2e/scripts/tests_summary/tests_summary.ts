import * as core from '@actions/core';
import { parseTests } from './parsing';
import { toColoredTime, toSuccess, toTime } from './utils';

async function generateSummary() {
  const sets = await parseTests();
  let s = core.summary;
  s = s.addTable([
    [
      { data: 'Set', header: true },
      { data: '🎯', header: true },
      { data: 'Time', header: true },
    ],
    ...sets.map(set => [
      { data: set.name },
      { data: toSuccess(set.success) },
      { data: toColoredTime(set.time, sets.map(s => s.time)) },
    ])
  ]);


  s = s.addRaw('<details><summary>Sets Details</summary>');
  s = s.addTable([
    [
      { data: 'Set', header: true },
      { data: 'Cmd', header: true },
      { data: 'Dir', header: true },
      { data: '🎯', header: true },
      { data: 'Time', header: true },
    ],
    ...sets.flatMap(set => [
      [
        { data: set.name, colspan: '3' },
        { data: toSuccess(set.success) },
        { data: toColoredTime(set.time, sets.map(s => s.time)) }
      ],
      ...set.commands.flatMap(cmd => [
        [
          { data: set.name },
          { data: cmd.command, colspan: '2' },
          { data: toSuccess(cmd.success) },
          { data: toTime(cmd.time) },
        ],
        ...cmd.dirs.map(dir => [
          { data: set.name },
          { data: cmd.command },
          { data: dir.name },
          { data: toSuccess(dir.success) },
          { data: toTime(dir.time) },
        ]),
      ]),
    ])
  ]);
  s = s.addRaw('</details>');


  s = s.addRaw('<details><summary>Tests Details</summary>');
  s = s.addTable([
    [
      { data: 'Set', header: true },
      { data: 'Mode', header: true },
      { data: 'Dir', header: true },
      { data: 'File', header: true },
      { data: 'Suite', header: true },
      { data: 'Test', header: true },
      { data: '🎯', header: true },
      { data: 'Time', header: true },
    ],
    ...sets.flatMap(set => [
      [
        { data: set.name, colspan: '6' },
        { data: toSuccess(set.success) },
        { data: toTime(set.time) }
      ],
      ...set.commands.flatMap(cmd =>
        cmd.dirs.flatMap(dir => [
          [
            { data: set.name },
            { data: cmd.browser + ' ' + cmd.browserSize },
            { data: dir.name, colspan: '4' },
            { data: toSuccess(dir.success) },
            { data: toTime(dir.time) },
          ],
          ...dir.files.flatMap(file => [
            [
              { data: set.name, rowspan: '' + (1 + file.tests.length) },
              { data: cmd.browser + ' ' + cmd.browserSize, rowspan: '' + (1 + file.tests.length) },
              { data: dir.name, rowspan: '' + (1 + file.tests.length) },
              { data: file.file, rowspan: '' + (1 + file.tests.length) },
              { data: file.suiteName, rowspan: '' + (1 + file.tests.length), colspan: '2' },
              { data: toSuccess(file.success) },
              { data: toTime(file.time) },
            ],
            ...file.tests.map(test => [
              { data: test.name },
              { data: toSuccess(test.success) },
              { data: toTime(test.time) },
            ])
          ]),
        ]),
      ),
    ])
  ]);
  s = s.addRaw('</details>');
  return s;
}

generateSummary()
.then(s => s.write())
.then(() => {
  process.exit(0);
})
.catch(e => {
  console.error(e);
  process.exit(1);
})
