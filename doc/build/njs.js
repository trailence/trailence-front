import fs from 'fs';
import generatePage from './generate_page.js';

async function defaultPage(request) {
  // TODO
}

async function docPage(request) {
  if (request.method != 'GET') {
    request.error(`Unsupported method: ${request.method}`);
    request.return(400);
    return;
  }
  let path = request.uri;
  if (path.startsWith('/')) path = path.substring(1);
  let i = path.indexOf('/');
  const lang = path.substring(0, i).toLowerCase();
  let page = path.substring(i + 1).toLowerCase();
  if (page.indexOf('/') >= 0 || !page.endsWith('.html')) {
    request.error(`Not found: ${request.uri}`);
    request.return(404);
    return;
  }
  page = page.substring(0, page.length - 5);

  generatePage.generatePage(lang, page, readFile)
  .then(result => {
    request.headersOut['Content-Type'] = 'text/html; charset=utf-8';
    request.return(200, result);
  })
  .catch(e=> {
    console.error('Error generating page', request.uri, e);
    request.return(500);
  });
}

function readFile(path) {
  return fs.promises.readFile('/usr/share/nginx/html/' + path, {encoding: 'utf-8'})
  .catch(e => {
    throw new Error('Read file ' + path + ': ' + e);
  });
}

export default {defaultPage, docPage};
