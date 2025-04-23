import * as create_user from './create_user.js';
import { parseTests } from './tests_parser.js';

const args = [...process.argv];
args.splice(0, 2);

let admin_username = '';
let admin_password = '';
let tests = [];
let preparation = false;
let other_args = '';

for (const arg of args) {
  if (arg.startsWith('--trailence-init-username='))
    admin_username = arg.substring(26);
  else if (arg.startsWith('--trailence-init-password='))
    admin_password = arg.substring(26);
  else if (arg.startsWith('--tests='))
    tests = parseTests(arg.substring(8).trim());
  else if (arg === '--preparation')
    preparation = true;
  else
    other_args += ' ' + arg;
}

if (!preparation && (admin_username.length === 0 || admin_password.length === 0)) {
  console.error('Missing admin username and/or password, arguments received:');
  for (const arg of args)
    console.error(arg);
  process.exit(1);
}

async function generateCommandLines() {
  let user_index = 1;
  let token = null;
  let preparation_done = [];
  for (const test of tests) {
    let username;
    let password;
    if (preparation) {
      username = 'a@a.com';
      password = 'b';
    } else if (test.admin) {
      username = admin_username;
      password = admin_password;
    } else {
      username = 'user_' + (user_index++) + '_' + Date.now() + '@trailence.org';
      password = '' + Date.now();
      if (!token) token = await create_user.loginAsAdmin(admin_username, admin_password);
      await create_user.createUser(token, username, password);
      if (test.roles.length > 0)
        await create_user.setUserRoles(token, username, test.roles);
    }
    let mode = '';
    if (test['browser']) {
      mode += ' --browser=' + test['browser'] + ' --browser-size=' + test['browserSize'];
    } else if (test['nativePlatform']) {
      mode += ' --native-platform=' + test['nativePlatform'] + ' --native-platform-version=' + test['nativePlatformVersion'] + ' --native-device=' + test['nativeDevice'];
    }
    if (preparation) {
      if (preparation_done.indexOf(mode) < 0) {
        preparation_done.push(mode);
      } else {
        continue;
      }
      mode += ' --exclude-tests=**/*.e2e.ts';
    }
    console.log('--trailence-username=' + username + ' --trailence-password=' + password + mode + ' --tests=' + test.specs.join(',') + other_args);
  }
}

await generateCommandLines();
