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

const tests = [];
const dir = fs.opendirSync('../test/specs');
try {
  let entry;
  while ((entry = dir.readSync()) !== null) {
    if (!entry.isDirectory()) continue;
    if (countTests('../test/specs/' + entry.name) === 0) continue;
    if (test_only.length === 0)
      tests.push({dir: entry.name, spec: entry.name + '/'});
    else if (test_only.indexOf('+') > 0) {
      const testIndex = test_only.split('+').findIndex(t => entry.name.startsWith(t));
      if (testIndex >= 0) tests.push({dir: entry.name, spec: entry.name + '/'});
    } else if (test_only.indexOf('/') >= 0) {
      const index = test_only.indexOf('/');
      if (entry.name.startsWith(test_only.substring(0, index))) {
        if (index === test_only.length - 1) {
          tests.push({dir: entry.name, spec: entry.name + '/'});
        } else {
          tests.push({dir: entry.name, spec: test_only});
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

if (tests.length === 0) {
  console.error('No test found matching ' + test_only);
  process.exit(1);
}

const admin_tests = [];
const user_tests = [];

for (const test of tests) {
  if (fs.existsSync('../test/specs/' + test.dir + '/admin.needed')) {
    admin_tests.push(test.spec);
  } else {
    user_tests.push(test);
  }
}

async function generateCommandLines() {
  if (admin_tests.length > 0)
    console.log('--trailence-init-username=' + admin_username + ' --trailence-init-password=' + admin_password + ' --test-only=' + admin_tests.join('+') + other_args);
  if (user_tests.length > 0) {
    const token = await create_user.loginAsAdmin(admin_username, admin_password);
    let index = 1;
    for (const test of user_tests) {
      const username = 'user_' + (index++) + '_' + Date.now() + '@trailence.org';
      const password = Date.now();
      await create_user.createUser(token, username, password);
      if (fs.existsSync('../test/specs/' + test.dir + '/user.role')) {
        const role = fs.readFileSync('../test/specs/' + test.dir + '/user.role', {encoding: 'utf8'}).trim();
        await create_user.setUserRoles(token, username, [role]);
      }
      console.log('--trailence-init-username=' + username + ' --trailence-init-password=' + password + ' --test-only=' + test.spec + other_args);
    }
  }
}

await generateCommandLines();
