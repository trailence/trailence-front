import fs from 'fs';

const TEXTS_VERSION = '45';

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
  return request.subrequest('/assets/i18n/' + lang.toLowerCase() + '.' + TEXTS_VERSION + '.json').then(r => JSON.parse(r.responseText));
}

function retrieveData(request, slug) {
  return request.subrequest('/api/public/trails/v1/trailBySlug/' + slug).then(r => JSON.parse(r.responseText));
}

function translateData(data, i18n, lang) {
  if (data.lang !== lang) {
    if (data.nameTranslations[lang]) data.name = data.nameTranslations[lang];
    if (data.descriptionTranslations[lang]) data.description = data.descriptionTranslations[lang];
  }
  data.i18n = i18n;
  data.activity = i18n.activity[data.activity];
  data.lang = lang;
  const nbRates = data.nbRate0 + data.nbRate1 + data.nbRate2 + data.nbRate3 + data.nbRate4 + data.nbRate5;
  if (nbRates > 0) {
    data.nbRates = nbRates;
    const rate = (data.nbRate1 + (data.nbRate2 * 2) + (data.nbRate3 * 3) + (data.nbRate4 * 4) + (data.nbRate5 * 5)) / nbRates;
    data.rate = '' + Math.floor(rate) + '.' + Math.floor((rate * 10) % 10) + ' / 5 ' + i18n.pages.trail.sections.comments.rate.global_on_nb.replace('{{1}}', nbRates);
    data.star1 = rate < 0.5 ? 'empty' : rate >= 1 ? 'filled' : 'half';
    data.star2 = rate < 1.5 ? 'empty' : rate >= 2 ? 'filled' : 'half';
    data.star3 = rate < 2.5 ? 'empty' : rate >= 3 ? 'filled' : 'half';
    data.star4 = rate < 3.5 ? 'empty' : rate >= 4 ? 'filled' : 'half';
    data.star5 = rate < 4.5 ? 'empty' : rate >= 5 ? 'filled' : 'half';
  }
  const jd = {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    "name": data.name,
    "description": data.description,
    "geo": {
      "@type":"GeoCoordinates",
      "latitude": '' + data.simplifiedPath[0],
      "longitude": '' + data.simplifiedPath[1]
    },
  };
  if (nbRates > 0) {
    const rate = (data.nbRate1 + (data.nbRate2 * 2) + (data.nbRate3 * 3) + (data.nbRate4 * 4) + (data.nbRate5 * 5)) / nbRates;
    jd['aggregateRating'] = {
      "@type": "AggregateRating",
      "ratingValue": Math.floor(rate) + '.' + Math.floor((rate * 10) % 10),
      "ratingCount": nbRates,
      "worstRating":"0",
      "bestRating":"5"
    };
  }
  if (data.photos && data.photos.length > 0) {
    jd['image'] = ['https://trailence.org/api/public/trails/v1/photo/' + data.uuid + '/' + data.photos[0].uuid];
  }
  data.jdJson = jd;
  return data;
}
/*
All Trails
<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","@id":"/fr/randonnee/france/alpes-de-haute-provence/col-de-la-cayolle","address":{"@type":"PostalAddress","addressLocality":"Barcelonnette, Alpes-de-Haute-Provence, France"},"geo":{"@type":"GeoCoordinates","latitude":"44.25961","longitude":"6.74396"},"name":"Col de la Cayolle","description":"Partez découvrir cet itinéraire en boucle de 8,7-km près de Barcelonnette, Alpes-de-Haute-Provence. Généralement considéré comme un parcours difficile, il faut en moyenne 3 h 9 min pour le parcourir. C’est un endroit très prisé pour la randonnée, vous croiserez donc probablement du monde pendant votre excursion. La meilleure période de visite est de mai à octobre. Vous devrez laisser votre chien à la maison car ils ne sont pas autorisés sur ce sentier.","aggregateRating":{"@type":"AggregateRating","ratingValue":4.6,"reviewCount":90,"worstRating":"0","bestRating":"5"},"image":["https://images.alltrails.com/eyJidWNrZXQiOiJhc3NldHMuYWxsdHJhaWxzLmNvbSIsImtleSI6InVwbG9hZHMvcGhvdG8vaW1hZ2UvMzkwNjQwNDkvZWI3MmZhODMwY2UxZDY4ZTc3M2VlN2Y0MjFjODIwMDguanBnIiwiZWRpdHMiOnsidG9Gb3JtYXQiOiJ3ZWJwIiwicmVzaXplIjp7IndpZHRoIjo1MDAsImhlaWdodCI6NTAwLCJmaXQiOiJpbnNpZGUifSwicm90YXRlIjpudWxsLCJqcGVnIjp7InRyZWxsaXNRdWFudGlzYXRpb24iOnRydWUsIm92ZXJzaG9vdERlcmluZ2luZyI6dHJ1ZSwib3B0aW1pc2VTY2FucyI6dHJ1ZSwicXVhbnRpc2F0aW9uVGFibGUiOjN9fX0="]}</script>
ClimbFinder
<script type="application/ld+json">{"@context":"http:\/\/schema.org","@type":"SportsActivityLocation","name":"Col de la Cayolle depuis Barcelonnette","image":"https:\/\/climbfinder.com\/https:\/\/image.climbfinder.com\/col-de-la-cayolle-barcelonnette.png","AggregateRating":{"@type":"aggregateRating","worstRating":1,"bestRating":5,"ratingValue":"5.0","ratingCount":"30"}}</script>
*/

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
