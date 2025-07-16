async function generate(request) {
  if (request.method != 'GET') {
    request.error(`Unsupported method: ${request.method}`);
    request.return(401);
    return;
  }
  const index = await request.subrequest('/index.html').then(r => r.responseText);
  const i = index.indexOf('<meta id="head_meta_description"');
  const j = index.indexOf('>', i);
  request.headersOut['Content-Type'] = 'text/html; charset=utf-8';
  request.headersOut['Cache-Control'] = 'no-cache';
  request.return(200, index.substring(0, i) + index.substring(j + 1));
}

export default {generate};
