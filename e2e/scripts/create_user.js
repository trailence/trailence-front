import * as crypto from 'crypto';

const baseUrl = process.env.IS_CI ? 'http://localhost:80' : 'http://localhost:8100';

export async function loginAsAdmin(email, password) {
  const keypair = await crypto.webcrypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    false,
    ['sign', 'verify']
  );

  const publicKeyBase64 = await crypto.webcrypto.subtle.exportKey('spki', keypair.publicKey)
    .then(pk => btoa(String.fromCharCode(...new Uint8Array(pk))));

  const body = JSON.stringify({
    email,
    password,
    publicKey: publicKeyBase64,
    expiresAfter: 60 * 60 * 1000,
  });
  const loginResponse = await fetch(baseUrl + '/api/auth/v1/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body
  });

  if (!loginResponse.ok) {
    console.error('Login error: ', await loginResponse.json(), 'request', body);
    process.exit(1);
  }
  const authResponse = await loginResponse.json();
  return authResponse.accessToken;
}

export async function createUser(adminToken, email, password) {
  const response = await fetch(baseUrl + '/api/admin/users/v1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + adminToken
    },
    body: JSON.stringify({email, password})
  });
  if (!response.ok) {
    console.error('Create user error: ', await response.json());
    process.exit(1);
  }
}

export async function setUserRoles(adminToken, email, roles) {
  const response = await fetch(baseUrl + '/api/admin/users/v1/' + email + '/roles', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + adminToken
    },
    body: JSON.stringify(roles)
  });
  if (!response.ok) {
    console.error('Set user roles error: ', await response.json(), 'request', JSON.stringify(roles));
    process.exit(1);
  }
}
