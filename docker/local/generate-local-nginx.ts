import * as fs from 'fs';

let conf = fs.readFileSync('../nginx.conf', { encoding: 'utf-8' });
let i = conf.indexOf('listen [::]:80;');
let j = conf.indexOf('listen [::]:443 ssl;');
conf = conf.substring(0, i + 15) + conf.substring(j + 20);

while ((i = conf.indexOf('ssl_certificate')) > 0) {
  j = conf.indexOf(';', i);
  conf = conf.substring(0, i) + conf.substring(j + 1);
}

conf = 'map $http_referer $allow_referer {\n  default 1;\n}\n\n' + conf;

fs.writeFileSync('../../www/nginx/default.conf.template', conf);
