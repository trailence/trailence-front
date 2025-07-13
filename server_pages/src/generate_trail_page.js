import fs from 'fs';

async function generate(request) {
  if (request.method != 'GET') {
    request.error(`Unsupported method: ${request.method}`);
    request.return(401);
    return;
  }
  let path = request.uri;
  if (path.startsWith('/')) path = path.substring(1);
  let i = path.indexOf('/');
  const lang = path.substring(0, i);
  path = path.substring(i + 1);
  if (!path.toLowerCase().startsWith('trail/')) {
    console.warn('Unexpected path', request.uri);
    request.return(307, '/');
    return;
  }
  const slug = path.substring(6);
  const data$ = retrieveData(request, slug);
  const template$ = fs.promises.readFile('/usr/share/nginx/njs/trail_page_template.html', {encoding: 'utf-8'});
  const i18n$ = retrieveTranslations(request, lang);

  Promise.all([data$, template$, i18n$])
  .then(result => fillTemplate(translateData(result[0], result[2], lang), result[1]))
  .then(result => {
    request.headersOut['Content-Type'] = 'text/html; charset=utf-8';
    request.return(200, result);
  })
  .catch(e=> {
    console.error('Error generating trail page', e);
    request.return(307, '/');
  });
}

function retrieveTranslations(request, lang) {
  return request.subrequest('/assets/i18n/' + lang.toLowerCase() + '.28.json').then(r => JSON.parse(r.responseText));
}

function retrieveData(request, slug) {
  return request.subrequest('/api/public/trails/v1/trailBySlug/' + slug).then(r => JSON.parse(r.responseText));
}

function translateData(data, i18n, lang) {
  data.lang = lang;
  data.i18n = i18n;
  data.activity = i18n.activity[data.activity];
  return data;
}

function fillTemplate(data, template) {
  let i = 0;
  let pos = 0;
  let s = '';
  while ((i = template.indexOf('{{', pos)) >= 0) {
    const j = template.indexOf('}}', i + 2);
    if (j < 0) break;
    let name = template.substring(i + 2, j).trim();
    const sep = name.indexOf(':');
    let fct = null;
    if (sep > 0) {
      fct = name.substring(0, sep);
      name = name.substring(sep + 1);
    }
    if (pos < i) s += template.substring(pos, i);
    if (!fct) {
      const value = resolveVariable(name, data);
      s += escapeHtml(value ? (typeof value === 'string' ? value : '' + value) : '');
      pos = j + 2;
    } else {
      const end = template.indexOf('{{/' + fct + '}}', j + 2);
      if (end < 0) break;
      const content = template.substring(j + 2, end);
      s += applyFunction(fct, name, content, data);
      pos = end + 5 + fct.length;
    }
  }
  if (pos < template.length) s += template.substring(pos);
  return s;
}

function resolveVariable(name, data) {
  const i = name.indexOf('|');
  if (i >= 0) {
    const j = name.indexOf('|', i + 1);
    if (j > 0) {
      const subname = name.substring(i + 1, j);
      name = name.substring(0, i) + resolveVariable(subname, data) + name.substring(j + 1);
      return resolveVariable(name, data);
    }
  }
  const elements = name.split('.');
  let obj = data;
  for (let elementIndex = 0; elementIndex < elements.length; ++elementIndex) {
    const element = elements[elementIndex];
    obj = obj[element];
    if (obj === null || obj === undefined) break;
  }
  return obj;
}

function applyFunction(fctName, fctValue, fctContent, data) {
  if (fctName === 'if') {
    fctValue = fctValue.startsWith('!') ? !resolveVariable(fctValue.substring(1), data) : resolveVariable(fctValue, data);
    if (!fctValue) return '';
    return fillTemplate(data, fctContent);
  } else if (fctName === 'distance') {
    fctValue = resolveVariable(fctValue, data);
    if (fctValue < 1000) return '' + fctValue + ' m';
    else return (fctValue/1000).toFixed(2) + ' km';
  } else if (fctName === 'duration') {
    fctValue = resolveVariable(fctValue, data);
    return durationToString(fctValue, data.i18n);
  } else if (fctName === 'elevation') {
    fctValue = resolveVariable(fctValue, data);
    return '' + fctValue + ' m';
  } else if (fctName === 'json') {
    fctValue = resolveVariable(fctValue, data);
    return JSON.stringify(fctValue);
  } else if (fctName === 'text') {
    fctValue = resolveVariable(fctValue, data);
    return (''+fctValue).replace(/\n/g, '<br/>');
  }
  return '';
}

function escapeHtml(unsafe) {
  return unsafe.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function durationToString(duration, i18n) {
  const minutes = Math.floor(duration / (1000 * 60));
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes - days * 24 * 60) / 60);
  const min = minutes - (days * 24 * 60) - (hours * 60);
  let minS = min.toString();
  if (hours === 0 && days === 0) {
    minS += i18n.duration.minutes;
    return minS;
  }
  if (minS.length < 2) minS = '0' + minS;
  let hourS = hours.toString();
  if (days === 0) return hourS + i18n.duration.hours + minS;
  if (hourS.length < 2) hourS = '0' + hourS;
  return '' + days + i18n.duration.days + hourS + i18n.duration.hours + minS;
}

export default {generate};
