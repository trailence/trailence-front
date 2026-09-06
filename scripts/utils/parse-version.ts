export function versionNameToVersionCode(versionName: string): number {
  const versionRegexp = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
  const version = versionName.match(versionRegexp);
  if (!version) {
    console.log('Invalid version: ', versionName);
    throw new Error('Invalid version: ' + versionName);
  }
  const major = parseInt(version[1]);
  const minor = parseInt(version[2]);
  const fix = parseInt(version[3]);

  return fix + minor * 100 + major * 10000;
}
