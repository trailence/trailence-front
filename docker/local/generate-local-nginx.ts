import * as fs from 'fs';

let conf = fs.readFileSync('../default.conf.template', { encoding: 'utf-8' });

// keep port 80 instead of 443
let i = conf.indexOf('listen [::]:80;');
let j = conf.indexOf('http2 on;');
conf = conf.substring(0, i + 15) + conf.substring(j + 9);

// remove second server for help
j = conf.indexOf('server {', i);
conf = conf.substring(0, j);

// remove remaining ssl stuff
while ((i = conf.indexOf('ssl_certificate')) > 0) {
  j = conf.indexOf(';', i);
  conf = conf.substring(0, i) + conf.substring(j + 1);
}

conf = 'map $http_referer $allow_referer {\n  default 1;\n}\n\n' + conf;

fs.writeFileSync('./context/default.conf.template', conf);
