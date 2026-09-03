import fs from 'node:fs';
import { SpecFile, Test, TestCommand, TestSet } from './model';
import { compareBy, getCommandLineArgument, getLineStartingWith, getNextLine, getTextAfter, Line } from './utils';

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
    const screenShots = new Map<string, string>();
    while ((dirEntry = await dir.read()) !== null) {
      if (dirEntry.isFile() && dirEntry.name.startsWith('test_') && dirEntry.name.endsWith('.log')) {
        let instance = dirEntry.name.substring(5, dirEntry.name.length - 4);
        logFiles.push(instance);
      } else if (dirEntry.isFile() && dirEntry.name.startsWith('wdio_error_') && dirEntry.name.endsWith('.png')) {
        let instance = dirEntry.name.substring(11);
        let i = instance.indexOf('_');
        if (i > 0) {
          screenShots.set(instance.substring(0, i), '../../output/' + outputEntry!.name + '/' + dirEntry.name);
        }
      }
    }
    await dir.close();
    const testSetPromises = logFiles
      .sort((f1, f2) => f1.localeCompare(f2))
      .map(cmdInstance =>
        readTestCommandLog('../../output/' + outputEntry!.name + '/test_' + cmdInstance + '.log', cmdInstance)
        .then(cmd => {
          cmd.screenShotFile = screenShots.get(cmdInstance);
          return cmd;
        })
      );
    promises.push(Promise.all(testSetPromises).then(testCommands => new TestSet(testSet, testCommands.sort((c1, c2) => c1.command.localeCompare(c2.command)))));
  }
  await outputDir.close();
  return (await Promise.all(promises)).sort((s1, s2) => s1.name.localeCompare(s2.name));
}

async function readTestCommandLog(filename: string, cmdInstance: string): Promise<TestCommand> {
  console.log('Analyzing', filename);
  const file = await fs.promises.readFile(filename, { encoding: 'utf-8' });
  const cmdLine = getLineStartingWith(file, '> wdio run ');
  const browser = getCommandLineArgument(cmdLine, '--browser');
  const browserSize = getCommandLineArgument(cmdLine, '--browser-size');
  const specs = getTestsSpecs(filename, file);
  return new TestCommand(cmdInstance, browser, browserSize, specs, getCommandTime(file));
}

function getCommandTime(file: string): number | undefined {
  let i1 = file.indexOf('[START TIME=');
  if (i1 < 0) return undefined;
  let i2 = file.indexOf(']', i1);
  if (i2 < 0) return undefined;
  const start = Number.parseInt(file.substring(i1 + 12, i2));
  if (Number.isNaN(start)) return undefined;

  i1 = file.indexOf('[END TIME=');
  if (i1 < 0) return undefined;
  i2 = file.indexOf(']', i1);
  if (i2 < 0) return undefined;
  const end = Number.parseInt(file.substring(i1 + 10, i2));
  if (Number.isNaN(end)) return undefined;

  return (end - start) * 1000;
}

function getTestsSpecs(filename: string, file: string): SpecFile[] {
  let pos = 0;
  const result: SpecFile[] = [];
  while ((pos = file.indexOf('» /test/specs/', pos)) > 0) {
    let j = file.indexOf('\n', pos);
    const specFile = file.substring(pos + 14, j).trim();
    let nextLine = getNextLine(file, j + 1);
    if (!nextLine) break;
    const suiteName = getTextAfter(nextLine.content, ']').trim();
    pos = nextLine.end + 1;
    const tests: Test[] = [];
    do {
      nextLine = getNextLine(file, pos);
      if (!nextLine) break;
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
    console.log('Suite found', suiteName, 'with', tests.length, 'tests in', filename, tests.map(t => '<' + t.name + '>'));
    if (!extractSuiteTimeFromJson(filename, file, suiteName, tests)) {
      console.warn('json not found', suiteName, 'in', filename);
      if (!extractSuiteTimeFromText(file, suiteName, tests)) {
        console.warn('Cannot find Suite done: ' + suiteName + 'in', filename);
      }
    }
    const dir = specFile.substring(0, specFile.indexOf('-'));
    result.push(new SpecFile(dir, specFile, suiteName, tests));
  }
  for (const testFile of result) {
    for (const test of testFile.tests.filter(t => !t.success)) {
      // try to find the error
      pos = 0;
      while ((pos = file.indexOf(') ' + testFile.suiteName + ' ' + test.name, pos)) > 0) {
        let nextLine = getNextLine(file, pos);
        if (!nextLine) break;
        nextLine = getNextLine(file, nextLine.end + 1);
        if (!nextLine) break;
        pos = extractError(file, test, nextLine);
        if (pos < 0) break;
      }
    }
  }
  return result.sort((f1, f2) => compareBy(f1, f2, [f => f.dir, f => f.file, f => f.suiteName]));
}

function extractSuiteTimeFromJson(filename: string, file: string, suiteName: string, tests: Test[]): boolean {
  let i = file.indexOf('Suite json¤' + suiteName + '¤');
  if (i < 0) return false;
  let j = file.indexOf('\n', i);
  if (j < 0) return false;
  try {
    const s = file.substring(i + 12 + suiteName.length, j).trim();
    const json = JSON.parse(s) as {suite: string, tests: {test: string, time: number}[]};
    if (json['suite'] !== suiteName) {
      console.warn('Suite json does not match', '<' + suiteName + '>', '<' + json['suite'] + '> in', filename);
      return false;
    }
    console.log('json found', suiteName, 'in', filename);
    for (const test of json.tests) {
      const item = tests.find(t => suiteName + ' ' + t.name === test.test && t.time === undefined);
      if (item) item.time = test.time;
    }
    console.log('suite parsed', suiteName, tests.filter(t => t.time !== undefined).length, '/', tests.length, 'in', filename);
    return true;
  } catch (e) {
    console.warn('Cannot parse suite json', e);
    return false;
  }
}

function extractSuiteTimeFromText(file: string, suiteName: string, tests: Test[]): boolean {
  let j = file.indexOf('Suite done: ' + suiteName + '\n');
  if (j < 0) return false;
  j += suiteName.length + 13;
  let additionalTimings: number[] = [];
  do {
    let nextLine = getNextLine(file, j);
    if (!nextLine) break;
    let i2 = nextLine.content.indexOf('#    - ');
    if (i2 < 0) {
      i2 = nextLine.content.indexOf(' ms.');
      if (i2 > 0) {
        // truncated line
        let i3 = nextLine.content.lastIndexOf(' ', i2 - 1);
        if (i3 >= 0) {
          const time = Number.parseInt(nextLine.content.substring(i3 + 1, i2).trim());
          if (!Number.isNaN(time)) additionalTimings.push(time);
        }
        j = nextLine.end + 1;
        continue;
      }
      break;
    }
    let i3 = nextLine.content.indexOf('¤');
    const testName = nextLine.content.substring(i2 + 7, i3);
    const test = tests.find(t => testName === (suiteName + ' ' + t.name) && t.time === undefined);
    if (test) {
      i2 = nextLine.content.indexOf(' ms.', i3 + 1);
      const time = Number.parseInt(nextLine.content.substring(i3 + 1, i2).trim());
      if (!Number.isNaN(time)) test.time = time;
    }
    j = nextLine.end + 1;
  } while (true);
  if (additionalTimings.length > 0 && tests.reduce((p,n) => p + (n.time === undefined ? 1 : 0), 0) === additionalTimings.length) {
    for (const test of tests) {
      if (test.time === undefined) {
        test.time = additionalTimings.splice(0, 1)[0];
      }
    }
  }
  return true;
}

function extractError(file: string, test: Test, nextLine: Line): number {
  let i = nextLine.content.indexOf('Error: ');
  if (i >= 0) {
    test.error = [nextLine.content.substring(i)];
    return extractErrorStackTrace(file, test, nextLine);
  }
  i = nextLine.content.indexOf('Expected ');
  if (i >= 0) {
    let j = nextLine.content.indexOf(']');
    if (j > 0) i = j + 1;
    test.error = [nextLine.content.substring(i)];
    return extractErrorExpectation(file, test, nextLine);
  }
  return nextLine.start;
}

function extractErrorStackTrace(file: string, test: Test, line: Line): number {
  let nextLine: Line | undefined = line;
  do {
    nextLine = getNextLine(file, nextLine.end + 1);
    if (!nextLine) break;
    let i = nextLine.content.indexOf('    at ');
    if (i < 0) break;
    test.error!.push(nextLine.content.substring(i));
  } while (true);
  if (!nextLine) return -1;
  return nextLine.start + 1;
}

function extractErrorExpectation(file: string, test: Test, line: Line): number {
  let nextLine: Line | undefined = line;
  for (let lines = 1; lines <= 20; lines++) {
    nextLine = getNextLine(file, nextLine.end + 1);
    if (!nextLine) break;
    let i = nextLine.content.indexOf('    at ');
    if (i > 0) {
      test.error!.push(nextLine.content.substring(i));
      return extractErrorStackTrace(file, test, nextLine);
    }
    test.error!.push(nextLine.content);
  }
  if (!nextLine) return -1;
  return nextLine.start + 1;
}

export async function getSetArtifactUrls(): Promise<Map<string, string>> {
  const server = process.env['GITHUB_SERVER_URL'];
  const repo = process.env['GITHUB_REPOSITORY']
  const runId = process.env['GITHUB_RUN_ID'];
  const baseUrl = server + '/' + repo + '/actions/runs/' + runId + '/artifacts/';
  const jsonFile = await fs.promises.readFile('../../output/artifacts.json', 'utf-8');
  const lines = jsonFile.split('\n');
  const result = new Map<string, string>();
  for (const line of lines) {
    let s = line.trim();
    if (!s.startsWith('{')) continue;
    const json = JSON.parse(s);
    const name = json['name'];
    if (typeof name !== 'string') continue;
    if (!name.startsWith('wdio_output_')) continue;
    const i = name.lastIndexOf('_');
    const set = name.substring(i + 1);
    const id = json['id'];
    if (!id) continue;
    result.set(set, baseUrl + id);
  }
  return result;
}
