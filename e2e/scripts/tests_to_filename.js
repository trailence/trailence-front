const tests = process.argv[2];

console.log(tests
  .replaceAll(':', '_')
  .replaceAll('.', '_')
  .replaceAll(',', '_')
);
