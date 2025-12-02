import { Config } from './config/config';
import { GeoTrekImport } from './importers/geotrek/geotrek-import';
import { Importer, ImportLimits, ImportLimitsConfig, ImportOutput } from './importers/importer';
import { TrailenceClient } from './trailence/trailence-client';
import { configureWindow } from './utils/window';

const args: {[key: string]: string} = {};
for (const arg of process.argv) {
  if (arg.startsWith('--')) {
    const i = arg.indexOf('=');
    if (i >= 0) {
      const name = arg.substring(2, i);
      const value = arg.substring(i + 1);
      args[name] = value;
    }
  }
}

const mode = args['mode'];
if (!mode) throw new Error('Missing --mode');
if (mode !== 'local' && mode !== 'prod') throw new Error('Invalid --mode=' + mode);

let requestedRemote: string | undefined = args['remote'];
if (requestedRemote.length === 0 || requestedRemote === '%npm_config_remote%') requestedRemote = undefined;

const config = new Config(mode);

const limitsConfig = config.getValue('import', 'limits');
const globalLimitsConfig = limitsConfig.global as ImportLimitsConfig;
const limitsConfigByRemote = limitsConfig.remote as ImportLimitsConfig;
const remotesConfig = config.getValue('import', 'remotes');

const adminTrailenceClient = new TrailenceClient(config, 'admin');

if (requestedRemote) {
  for (const remoteName of Object.keys(remotesConfig)) {
    if (remoteName !== requestedRemote) delete remotesConfig[remoteName];
  }
}

if (Object.keys(remotesConfig).length === 0) {
  throw new Error('No remote to process.');
}

await configureWindow();

function computeLimit(remoteConfig: number | undefined, byRemote: number | undefined, global: number | undefined, done: number) {
  let limit = remoteConfig;
  if (byRemote !== undefined) limit = limit === undefined ? byRemote : Math.min(limitsConfig, byRemote);
  if (global !== undefined) limit = limit === undefined ? (global - done) : Math.min(limit, global - done);
  return limit ?? 0;
}

const globalDone = new ImportOutput();

for (const remoteName of Object.keys(remotesConfig)) {
  console.log('--- Processing remote: ' + remoteName + ' ---');
  console.log('');

  const remoteLimits = remotesConfig[remoteName] as ImportLimitsConfig;
  const limits = new ImportLimits({
    new: computeLimit(remoteLimits.new, limitsConfigByRemote.new, globalLimitsConfig.new, globalDone.new),
    update: computeLimit(remoteLimits.update, limitsConfigByRemote.update, globalLimitsConfig.update, globalDone.update),
    pending: computeLimit(remoteLimits.pending, limitsConfigByRemote.pending, globalLimitsConfig.pending, globalDone.pending),
  });

  const remoteTrailenceClient = new TrailenceClient(config, remoteName);

  await adminTrailenceClient.createUserIfNeeded(remoteTrailenceClient.username, remoteTrailenceClient.password);
  const displayName = config.getString(remoteName, 'displayName');
  if (displayName)
    await remoteTrailenceClient.setDisplayName(displayName);

  const remoteType = config.getRequiredString(remoteName, 'type');

  let importer: Importer | undefined = undefined;
  switch (remoteType) {
    case 'geotrek': importer = new GeoTrekImport(remoteTrailenceClient, config, remoteName); break;
    default: throw new Error('Unknown remote type: ' + remoteType);
  }

  const remoteOutput = await importer.importTrails(limits);
  globalDone.new += remoteOutput.new;
  globalDone.update += remoteOutput.update;
  globalDone.pending += remoteOutput.pending;
  globalDone.delete += remoteOutput.delete;

  console.log('');
  console.log('--- Remote done: ' + remoteName + ' ---');
  console.log('');
}

console.log('Done.');
