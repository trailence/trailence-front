import fs from 'fs';

async function generate(request) {
  if (request.method != 'GET') {
    request.error(`Unsupported method: ${request.method}`);
    request.return(401);
    return;
  }
  if (!request.uri.startsWith('/public/trail/')) {
    request.headersOut['Location'] = '/';
    request.return(307);
    return;
  }
  const slug = request.uri.substring(14);
  // TODO validate slug
  const data$ = retrieveData(request, slug);
  const template$ = fs.promises.readFile('/usr/share/nginx/njs/trail_page_template.html', {encoding: 'utf-8'});

  Promise.all([data$, template$])
  .then(result => fillTemplate(result[0], result[1], slug))
  .catch(() => {
    request.headersOut['Location'] = '/';
    request.return(307);
  })
  .then(result => {
    request.headersOut['Content-Type'] = 'text/html; charset=utf-8';
    request.return(200, result);
  });
}

function retrieveData(request, slug) {
  // TODO return request.subrequest('/api/publication/v1/trail/' + slug);
  return Promise.resolve(JSON.stringify({
    name: 'Hello World',
    description: 'Description with some <h1>HTML</h1> that should be escaped'
  }));
}

function fillTemplate(dataStr, template, slug) {
  let i = 0;
  let pos = 0;
  let s = '';
  let data = JSON.parse(dataStr);
  while ((i = template.indexOf('{{', pos)) >= 0) {
    const j = template.indexOf('}}', i + 2);
    if (j < 0) break;
    const name = template.substring(i + 2, j).trim();
    if (pos < i) s += template.substring(pos, i);
    s += resolveVariable(name, data);
    pos = j + 2;
  }
  if (pos < template.length) s += template.substring(pos);
  return s;
}

function resolveVariable(name, data) {
  return escapeHtml(data[name] || '');
}

function escapeHtml(unsafe) {
  return unsafe.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default {generate};
