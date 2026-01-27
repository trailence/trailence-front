async function generatePage(lang, pageName, readFile) {
  const indexContent$ = readFile('site/index.html');
  const menuContent$ = readFile('site/menu.' + lang + '.html');
  const pageContent$ = readFile('site/pages/' + pageName + '/' + pageName + '.' + lang + '.html');
  const pageMeta$ = readFile('site/pages/' + pageName + '/' + pageName + '.' + lang + '.json').then(text => JSON.parse(text));
  const files = await Promise.all([indexContent$, menuContent$, pageContent$, pageMeta$]);
  return await generateIndexHtml(lang, pageName, files[0], files[1], files[2], files[3], readFile);
}

async function generateIndexHtml(lang, pageName, indexHtml, menuHtml, pageHtml, pageMeta, readFile) {
  let result = indexHtml;
  let pos = 0;
  while ((pos = result.indexOf('{{', pos)) >= 0) {
    const end = result.indexOf('}}', pos + 2);
    if (end < 0) break;
    result = result.substring(0, pos) + await generatePlaceholder(result.substring(pos + 2, end), lang, menuHtml, pageName, pageHtml, pageMeta, readFile) + result.substring(end + 2);
  }
  return result;
}

async function generatePlaceholder(placeholder, lang, menuHtml, pageName, pageHtml, pageMeta, readFile) {
  placeholder = placeholder.trim();
  if (placeholder.startsWith('meta:')) {
    const path = placeholder.substring(5).split('.');
    let meta = pageMeta;
    for (let i = 0; i < path.length; ++i) {
      meta = meta[path[i]];
      if (meta === undefined || meta === null) break;
    }
    if (meta === undefined || meta === null)
      return '<!-- unknown meta ' + JSON.stringify(path) + ' -->';
    return '' + meta;
  }
  if (placeholder.startsWith('icon:')) {
    const iconName = placeholder.substring(5);
    return await readFile('static/icons/' + iconName + '.' + iconsVersions[iconName] + '.svg');
  }
  switch (placeholder) {
    case 'page': return pageHtml;
    case 'menu': return menuHtml;
    case 'lang': return lang;
    case 'pageName': return pageName;
    case 'endTitle':
      if (pageName === 'home') return '';
      switch (lang) {
        case 'fr': return ' - Aide Trailence';
        default: return ' - Trailence Help';
      }
    default: return '<!-- unknown placeholder [' + placeholder + '] -->';
  }
}

const iconsVersions = {
  menu: 1,
  trailence: 1,
  "theme-dark": 1,
  "theme-light": 1,
};

export default { generatePage };
