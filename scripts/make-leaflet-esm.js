const fs = require('fs');

let pkg = fs.readFileSync('./node_modules/leaflet/package.json', {encoding: 'utf8'});
const i = pkg.indexOf('"main": "dist/leaflet-src.js"');
if (i > 0) {
  pkg = pkg.substring(0, i) + '"main": "dist/leaflet-src.esm.js"' + pkg.substring(i + 29);
  fs.writeFileSync('./node_modules/leaflet/package.json', pkg);
}
