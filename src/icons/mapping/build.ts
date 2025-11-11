import * as fs from 'fs';
import { SRC_ICONS } from './src';

const iconsVersion = '5';
const srcPath = 'src/icons';
const svgPath = 'src/assets/icons.' + iconsVersion + '.svg';
const listPath = 'src/app/services/assets/icons.ts';

function getIconNames(filename: string): string[] {
  const names: string[] = [];
  for (const iconName in SRC_ICONS) {
    if (SRC_ICONS[iconName] === filename) names.push(iconName);
  }
  return names;
}

function removeXmlHeader(xml: string): string {
  xml = xml.trim();
  if (!xml.startsWith('<?xml')) return xml;
  let i = xml.indexOf('?>');
  return xml.substring(i + 2).trim();
}

let svgOutput = '<icons>\n';
let listOutput = 'export const ICONS: string[] = [\n';

let filesDone: string[] = [];

for (const iconName in SRC_ICONS) {
  const iconFilename = SRC_ICONS[iconName];
  if (filesDone.indexOf(iconFilename) >= 0) continue;
  filesDone.push(iconFilename);
  const names = getIconNames(iconFilename);
  let icon = fs.readFileSync(srcPath + '/' + iconFilename, 'utf-8');
  icon = removeXmlHeader(icon);
  svgOutput += '<icon names="' + names.join(',') + '">' + icon + '</icon>\n';
  for (const name of names) {
    listOutput += "  '" + name + "',\n";
  }
}

svgOutput += '</icons>';
listOutput += '];';

fs.writeFileSync(svgPath, svgOutput);
fs.writeFileSync(listPath, listOutput);
