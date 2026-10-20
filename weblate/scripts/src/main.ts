import fs from 'node:fs';
import { parseCommandLine } from '@utils/process-args';
import { XLiffWriter } from './xliff';
import { getLanguage, LANGUAGES } from './languages';

const scriptsDir = process.cwd();
const weblateDir = fs.realpathSync(scriptsDir + '/..');
const rootDir = fs.realpathSync(weblateDir + '/..');

const cmd = parseCommandLine();

switch (cmd.command[0]) {
  case 'to-weblate': {
    const target = cmd.requiresOption('to');
    const targetLanguages = target === 'all' ? LANGUAGES : [getLanguage(target)];
    for (const lang of targetLanguages) {
      const writer = new XLiffWriter(rootDir + '/src/assets/i18n', lang, weblateDir + '/translations/' + lang.isoCode + '.xliff');
      writer.generate();
    }
    break;
  }
  default:
    console.error('Unknown command');
}
