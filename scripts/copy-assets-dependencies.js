const fs = require('fs');

const dependencies = [
  {
    module: 'blob-stream',
    files: [
      { name: 'blob-stream', src: '.js', dst: 'blob-stream.<version>.js' },
    ]
  }, {
    module: 'svg-to-pdfkit',
    files: [
      { name: 'svg-to-pdfkit', src: 'source.js', dst: 'svg-to-pdfkit.<version>.js' },
    ]
  }, {
    module: 'pdfkit',
    files: [
      { name: 'pdfkit', src: 'js/pdfkit.standalone.js', dst: 'pdfkit.<version>.js' },
    ]
  }, {
    module: 'pdfjs-dist',
    files: [
      { name: 'pdfjs', src: 'build/pdf.min.mjs', dst: 'pdfjs.<version>.mjs' },
      { name: 'pdfjs-worker', src: 'build/pdf.worker.min.mjs', dst: 'pdfjs.worker.<version>.mjs' },
      { name: 'pdf-viewer', src: 'web/pdf_viewer.mjs', dst: 'pdf-viewer.<version>.mjs' },
      { name: 'pdf-viewer-css', src: 'web/pdf_viewer.css', dst: 'pdf-viewer.<version>.css' },
    ]
  }
];

function removeCurrentVersion(file) {
  var i = file.indexOf('<version>');
  var start = file.substring(0, i);
  var end = file.substring(i + 9);
  var dir = fs.opendirSync('./src/assets');
  var entry;
  while ((entry = dir.readSync()) != null) {
    if (!entry.isFile()) continue;
    if (!entry.name.startsWith(start)) continue;
    if (!entry.name.endsWith(end)) continue;
    fs.unlinkSync('./src/assets/' + entry.name);
    break;
  }
  dir.closeSync();
}

var versions = 'export const assetsDependencies = {\n';
for (var depIndex = 0; depIndex < dependencies.length; depIndex++) {
  var dep = dependencies[depIndex];
  var package = JSON.parse(fs.readFileSync('./node_modules/' + dep.module + '/package.json', {encoding: 'utf8'}));
  var version = package.version;
  for (var fileIndex = 0; fileIndex < dep.files.length; fileIndex++) {
    var file = dep.files[fileIndex];
    var dst = file.dst.replace('<version>', version);
    versions += '\t\'' + file.name + '\': \'' + dst + '\',\n';
    if (fs.existsSync('./src/assets/' + dst)) continue;
    removeCurrentVersion(file.dst);
    fs.copyFileSync('./node_modules/' + dep.module + '/' + file.src, './src/assets/' + dst);
  }
}
versions += '};\n';
fs.writeFileSync('./src/app/assets-dependencies.ts', versions);
