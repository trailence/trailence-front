import { parseCommandLine } from '@utils/process-args';
import fs from 'node:fs';
import { checkI18n } from './check-i18n';
import { checkReleaseNotes } from './check-release-note';
import { checkAssetsVersion } from './check-assets-version';

const cmd = parseCommandLine();
const baseDir = fs.realpathSync(process.cwd() + '/../..');
const errors: string[] = [];

switch (cmd.command[0] ?? '') {
  case 'check-i18n':
    checkI18n(baseDir, errors);
    break;
  case 'check-release-notes':
    checkReleaseNotes(baseDir, cmd.requiresOption('version'), errors);
    break;
  case 'check-assets-version':
    checkAssetsVersion(baseDir, errors);
    break;
  case 'check-all':
    checkI18n(baseDir, errors);
    checkAssetsVersion(baseDir, errors);
    checkReleaseNotes(baseDir, cmd.requiresOption('version'), errors);
    break;
  default:
    errors.push('Unknown command: ' + JSON.stringify(cmd));
}

if (errors.length === 0)
  process.exit(0);
for (const error of errors)
  console.error(error);
process.exit(1);
