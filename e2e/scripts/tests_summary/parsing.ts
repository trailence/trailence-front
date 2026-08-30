import fs from 'node:fs';
import { SpecFile, Test, TestCommand, TestSet } from './model';
import { compareBy, getCommandLineArgument, getLineStartingWith, getNextLine, getTextAfter } from './utils';

export async function parseTests(): Promise<TestSet[]> {
  const promises: Promise<TestSet>[] = [];
  const outputDir = await fs.promises.opendir('../../output');
  let outputEntry: fs.Dirent<string> | null;
  while ((outputEntry = await outputDir.read()) !== null) {
    if (!outputEntry.isDirectory()) continue;
    const i = outputEntry.name.lastIndexOf('_');
    if (i < 0) continue;
    const testSet = outputEntry.name.substring(i + 1);
    console.log('Output directory', outputEntry.name, ' for test set', testSet);
    const dir = await fs.promises.opendir('../../output/' + outputEntry.name);
    let dirEntry: fs.Dirent<string> | null;
    const logFiles: string[] = [];
    while ((dirEntry = await dir.read()) !== null) {
      if (dirEntry.isFile() && dirEntry.name.startsWith('test_') && dirEntry.name.endsWith('.log'))
        logFiles.push(dirEntry.name);
    }
    await dir.close();
    const testSetPromises = logFiles
      .sort((f1, f2) => f1.localeCompare(f2))
      .map(logfile => readTestCommandLog('../../output/' + outputEntry!.name + '/' + logfile));
    promises.push(Promise.all(testSetPromises).then(testCommands => new TestSet(testSet, testCommands.sort((c1, c2) => c1.command.localeCompare(c2.command)))));
  }
  await outputDir.close();
  return (await Promise.all(promises)).sort((s1, s2) => s1.name.localeCompare(s2.name));
}

async function readTestCommandLog(filename: string): Promise<TestCommand> {
  console.log('Analyzing', filename);
  const file = await fs.promises.readFile(filename, { encoding: 'utf-8' });
  const cmdLine = getLineStartingWith(file, '> wdio run ');
  const browser = getCommandLineArgument(cmdLine, '--browser');
  const browserSize = getCommandLineArgument(cmdLine, '--browser-size');
  const specs = getTestsSpecs(file);
  return new TestCommand(browser, browserSize, specs);
}

function getTestsSpecs(file: string): SpecFile[] {
  let pos = 0;
  const result: SpecFile[] = [];
  while ((pos = file.indexOf('» /test/specs/', pos)) > 0) {
    let j = file.indexOf('\n', pos);
    const specFile = file.substring(pos + 14, j).trim();
    let nextLine = getNextLine(file, j + 1);
    const suiteName = getTextAfter(nextLine.content, ']').trim();
    pos = nextLine.end + 1;
    const tests: Test[] = [];
    do {
      nextLine = getNextLine(file, pos);
      pos = nextLine.end + 1;
      const success = getTextAfter(nextLine.content, '✓ ').trim();
      if (success.length > 0) {
        tests.push({name: success, success: true});
        continue;
      }
      const error = success.length > 0 ? '' : getTextAfter(nextLine.content, '✖ ');
      if (error.length > 0) {
        tests.push({name: error, success: false});
        continue;
      }
      break;
    } while (true);
    j = file.indexOf('Suite done: ' + suiteName + '\n');
    if (j > 0) {
      j += suiteName.length + 13;
      do {
        nextLine = getNextLine(file, j);
        let i2 = nextLine.content.indexOf(']  - ');
        if (i2 < 0) break;
        let i3 = nextLine.content.lastIndexOf(':');
        const testName = nextLine.content.substring(i2 + 5, i3);
        const test = tests.find(t => testName === (suiteName + ' ' + t.name));
        if (test) {
          i2 = nextLine.content.indexOf(' ms.', i3 + 1);
          const time = Number.parseInt(nextLine.content.substring(i3 + 1, i2).trim());
          if (!Number.isNaN(time)) test.time = time;
        }
        j = nextLine.end + 1;
      } while (true);
    } else {
      console.warn('Cannot find Suite done: ' + suiteName);
    }
    const dir = specFile.substring(0, specFile.indexOf('-'));
    result.push(new SpecFile(dir, specFile, suiteName, tests));
  }
  return result.sort((f1, f2) => compareBy(f1, f2, [f => f.dir, f => f.file, f => f.suiteName]));
}
