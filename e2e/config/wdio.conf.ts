import { parseArguments } from './arguments';
import { baseConfig } from './conf.base';
import { browserConfig } from './conf.browser';
import { nativeConfig } from './conf.native';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as child_process from 'child_process';

const args = parseArguments();
let isCi = false;
if (process.env.IS_CI) {
  isCi = true;
}

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

const downloadPath = path.join(__dirname, '..', 'tmp-data', '' + args.instance, 'downloads');
const userDataPath = path.join(__dirname, '..', 'tmp-data', '' + args.instance, 'user-data');

export const config = {
  ...baseConfig,
  specs: args.specs,
  exclude: args.excludeSpecs,
  ...(
    args.browser ? browserConfig(args, downloadPath, userDataPath, isCi) :
    args.nativePlatform ? nativeConfig(args, downloadPath, userDataPath, isCi) :
    { capabilities: [] }
  ),
  child_process: child_process,
  trailence: {
    username: args.trailenceUsername,
    password: args.trailencePassword,
    dbUsername: args.dbUsername,
    dbPassword: args.dbPassword,
    browserSize: args.browserSize,
    native: args.nativePlatform,
    instance: args.instance,
  }
} as any as WebdriverIO.Config;

console.log('Launching tests with config', config);
