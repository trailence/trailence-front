import * as fs from 'fs';
import * as create_user from './create_user.js';

const args = [...process.argv];
args.splice(0, 2);

let admin_username = '';
let admin_password = '';
let test_only = '';
let other_args = '';
let browser = 'chrome';
let mode = 'desktop';

for (const arg of args) {
  if (arg.startsWith('--trailence-init-username='))
    admin_username = arg.substring(26);
  else if (arg.startsWith('--trailence-init-password='))
    admin_password = arg.substring(26);
  else if (arg.startsWith('--test-only=')) {
    test_only = arg.substring(12).trim();
  } else {
    other_args += ' ' + arg;
    if (arg.startsWith('--test-browser=')) {
      browser = arg.substring(15);
    } else if (arg.startsWith('--trailence-mode=')) {
      mode = arg.substring(17);
    }
  }
}

if (admin_username.length === 0 || admin_password.length === 0) {
  console.error('Missing admin username and/or password, arguments received:');
  for (const arg of args)
    console.error(arg);
  process.exit(1);
}

function countTests(path) {
  const dir = fs.opendirSync(path);
  let count = 0;
  try {
    let entry;
    while ((entry = dir.readSync()) !== null) {
      if (!entry.name.endsWith('.e2e.ts')) continue;
      if (entry.name.indexOf('.no-' + browser + '.') > 0) continue;
      if (entry.name.indexOf('.mobile.') > 0 && mode !== 'mobile') continue;
      if (entry.name.indexOf('.desktop.') > 0 && mode !== 'desktop') continue;
      count++;
    }
  } finally {
    dir.closeSync();
  }
  return count;
}

// [{spec, sequence: [subspec]}]
const requestedTests = test_only.length === 0 ? [] : test_only.split('+').map(spec => ({spec, sequence: spec.split(',').map(s => s.indexOf('/') > 0 ? s : (s + '/'))}));

function searchEligibleTests() {
  const tests = [];
  const adminTests = [];
  const dir = fs.opendirSync('../test/specs');
  try {
    let entry;
    while ((entry = dir.readSync()) !== null) {
      if (!entry.isDirectory()) continue;
      if (countTests('../test/specs/' + entry.name) === 0) continue;
      if (requestedTests.length === 0) {
        if (fs.existsSync('../test/specs/' + entry.name + '/admin.needed')) {
          adminTests.push(entry.name + '/');
        } else {
          tests.push({match: entry.name, specs: [{dir: entry.name, spec: entry.name + '/'}]});
        }
      } else {
        for (const requestedTest of requestedTests) {
          const subspec = requestedTest.sequence.find(s => {
            const i = s.indexOf('/');
            return entry.name.startsWith(s.substring(0, i));
          });
          if (subspec) {
            if (fs.existsSync('../test/specs/' + entry.name + '/admin.needed')) {
              adminTests.push(entry.name + '/');
            } else {
              const existing = tests.find(t => t.match === requestedTest.spec);
              if (existing) {
                existing.specs.push({dir: entry.name, spec: subspec});
              } else {
                tests.push({match: requestedTest.spec, specs: [{dir: entry.name, spec: subspec}]});
              }
            }
            break;
          }
        }
      }
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    dir.closeSync();
  }
  return {tests, adminTests};
}

function addRolesToTests(tests) {
  for (const test of tests) {
    const roles = [];
    for (const spec of test.specs) {
      if (fs.existsSync('../test/specs/' + spec.dir + '/user.role')) {
        const testRoles = fs.readFileSync('../test/specs/' + spec.dir + '/user.role', {encoding: 'utf8'}).split('\n');
        for (const role of testRoles) {
          const r = role.trim();
          if (r.length > 0 && roles.indexOf(r) < 0) roles.push(r);
        }
      }
    }
    test.roles = roles;
  }
}

const allTests = searchEligibleTests();
if (allTests.adminTests.length === 0 && allTests.tests.length === 0) {
  console.error('No test found matching ' + test_only);
  process.exit(1);
}
addRolesToTests(allTests.tests);

async function generateCommandLines() {
  if (allTests.adminTests.length > 0)
    console.log('--trailence-init-username=' + admin_username + ' --trailence-init-password=' + admin_password + ' --test-only=' + allTests.adminTests.join('+') + other_args);
  if (allTests.tests.length > 0) {
    const token = await create_user.loginAsAdmin(admin_username, admin_password);
    let index = 1;
    for (const test of allTests.tests) {
      const username = 'user_' + (index++) + '_' + Date.now() + '@trailence.org';
      const password = Date.now();
      await create_user.createUser(token, username, password);
      if (test.roles.length > 0)
        await create_user.setUserRoles(token, username, test.roles);
      console.log('--trailence-init-username=' + username + ' --trailence-init-password=' + password + ' --test-only=' + test.specs.map(s => s.spec).join('+') + other_args);
    }
  }
}

await generateCommandLines();
