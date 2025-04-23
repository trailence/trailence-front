import * as fs from 'fs';

export function parseTests(tests) {

  // starts with "x:" to be ignored
  // § split between modes
  // each mode has parameters separated by : with last parameter being specs
  // specs:
  //  - '+' split tests that can be run in parallel
  //  - ',' concatenates tests to be run in sequence
  //  - each spec;
  //    - if a '/' is present it means the first part is the start of a folder
  //    - if there is nothing after '/' it means all tests in the folder
  //    - if there is something after, it is the start of a test spec file

  // remove leading "x:" if present
  let i = tests.indexOf(':');
  if (i > 0) {
    let j = parseInt(tests.substring(0, i));
    if (!isNaN(j) && j > 0) {
      tests = tests.substring(i + 1);
    }
  }

  const allSpecs = listTests();
  const result = [];

  // split with '§'
  for (const modeStr of tests.split('§')) {
    i = modeStr.lastIndexOf(':');
    const modesStr = modeStr.substring(0, i).split(':');
    const specsStr = modeStr.substring(i + 1);

    const test = {};
    if (modesStr[0] === 'browser') {
      test['browser'] = modesStr.length > 1 ? modesStr[1] : 'chrome';
      test['browserSize'] = modesStr.length > 2 ? modesStr[2] : 'desktop';
    } else if (modesStr[0] === 'native') {
      test['nativePlatform'] = modesStr.length > 1 ? modesStr[1] : 'Android';
      test['nativePlatformVersion'] = modesStr.length > 2 ? modesStr[2] : '13.0';
      test['nativeDevice'] = modesStr.length > 3 ? modesStr[3] : 'Pixel_8_API_33';
    } else {
      throw new Error('Unknown mode <' + modesStr[0] + '> in: ' + modesStr);
    }

    const parallelSpecs = specsStr.split('+');
    for (const parallelSpec of parallelSpecs) {
      const sequenceSpecs = parallelSpec.split(',');
      const specs = [];
      for (const sequenceSpec of sequenceSpecs) {
        specs.push(...getTestsToRun(allSpecs, sequenceSpec).filter(spec => {
          if (test['browser'] && spec.spec.indexOf('.no-' + test['browser'] + '.') > 0) return false;
          if (test['browserSize'] === 'desktop' && spec.spec.indexOf('.mobile.') > 0) return false;
          if (test['browserSize'] === 'mobile' && spec.spec.indexOf('.desktop.') > 0) return false;
          if (test['nativePlatform'] && spec.spec.indexOf('.desktop.') > 0) return false;
          return true;
        }));
      }
      if (specs.length === 0) continue;
      result.push({
        ...test,
        admin: specs.reduce((p,n) => p || n.admin, false),
        roles: specs.reduce((p,n) => {
          const r = [...p];
          for (const role of n.roles) if (r.indexOf(role) < 0) r.push(role);
          return r;
        }, []),
        specs: specs.reduce((p,n) => {
          return [...p, n.spec]
        }, []).sort(),
      });
    }
  }

  return result;
}

function listTests() {
  const dir = fs.opendirSync('../test/specs');
  const result = [];
  try {
    let entry;
    while ((entry = dir.readSync()) !== null) {
      if (!entry.isDirectory()) continue;
      const tests = {
        dir: entry.name,
        tests: listDirTests('../test/specs/' + entry.name),
        admin: fs.existsSync('../test/specs/' + entry.name + '/admin.needed'),
        roles: [],
      };
      if (tests.tests.length === 0) continue;
      if (!tests.admin) {
        if (fs.existsSync('../test/specs/' + entry.name + '/user.role')) {
          const testRoles = fs.readFileSync('../test/specs/' + entry.name + '/user.role', {encoding: 'utf8'}).split('\n');
          for (const role of testRoles) {
            const r = role.trim();
            if (r.length > 0 && tests.roles.indexOf(r) < 0) tests.roles.push(r);
          }
        }
      }
      result.push(tests);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    dir.closeSync();
  }
  return result;
}

function listDirTests(path) {
  const dir = fs.opendirSync(path);
  const result = [];
  try {
    let entry;
    while ((entry = dir.readSync()) !== null) {
      if (entry.isDirectory()) continue;
      if (!entry.name.endsWith('.e2e.ts')) continue;
      result.push(entry.name);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    dir.closeSync();
  }
  return result;
}

function getTestsToRun(allSpecs, specStr) {
  const i = specStr.indexOf('/');
  let isEligible;
  if (i > 0) {
    const dirStart = specStr.substring(0, i);
    const fileStart = specStr.substring(i + 1);
    isEligible = function(dir, spec) {
      if (!dir.startsWith(dirStart)) return false;
      return fileStart.length === 0 || spec.startsWith(fileStart);
    }
  } else {
    isEligible = function(dir, spec) { return dir.startsWith(specStr); }
  }
  const result = [];
  for (const dir of allSpecs) {
    for (const spec of dir.tests) {
      if (!isEligible(dir.dir, spec)) continue;
      result.push({
        spec: dir.dir + '/' + spec,
        admin: dir.admin,
        roles: dir.roles,
      });
    }
  }
  return result;
}
