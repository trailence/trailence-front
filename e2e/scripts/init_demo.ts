import { createUser, loginAsAdmin, userExists } from './create_user';

const args = [...process.argv];

let admin_username = '';
let admin_password = '';
let demo_username = '';
let demo_password = '';

for (const arg of args) {
  if (arg.startsWith('--trailence-init-username='))
    admin_username = arg.substring(26);
  else if (arg.startsWith('--trailence-init-password='))
    admin_password = arg.substring(26);
  else if (arg.startsWith('--trailence-username='))
    demo_username = arg.substring(21);
  else if (arg.startsWith('--trailence-password='))
    demo_password = arg.substring(21);
}

if (demo_username === '' || demo_password === '') {
  console.error('Missing demo user');
  process.exit(1);
}

loginAsAdmin(admin_username, admin_password)
.then(adminToken => {
  return userExists(adminToken, demo_username).then(exists => {
    if (exists) {
      console.log('Demo user exists.')
      return;
    }
    console.log('Demo user does not exist: creating it...');
    return createUser(adminToken, demo_username, demo_password).then(() => console.log('Demo user created: ' + demo_username));
  })
})
.then(() => process.exit(0));
