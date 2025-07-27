const fs = require('fs');

let pkg = fs.readFileSync('./node_modules/ng2-charts/lib/ng-charts.provider.d.ts', {encoding: 'utf8'});
const i = pkg.indexOf("from 'chart.js/dist/types/utils'");
if (i > 0) {
  pkg = pkg.substring(0, i) + "from 'node_modules/chart.js/dist/types/utils'" + pkg.substring(i + 32);
  fs.writeFileSync('./node_modules/ng2-charts/lib/ng-charts.provider.d.ts', pkg);
}
