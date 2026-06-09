import fs from 'node:fs';

const args: {[key: string]: string} = {};
for (const arg of process.argv) {
  if (arg.startsWith('--')) {
    const i = arg.indexOf('=');
    if (i >= 0) {
      const name = arg.substring(2, i);
      const value = arg.substring(i + 1);
      args[name] = value;
    }
  }
}

const src = args['src'];
const dst = args['dst'];
const max = Number.parseInt(args['max']);

async function split() {
  await fs.promises.mkdir(dst);
  const srcDir = await fs.promises.opendir(src);
  const created = new Set<number>();
  let entry;
  while ((entry = srcDir.readSync()) !== null) {
    if (entry.isFile() && entry.name.endsWith('.tile')) {
      const tile = Number.parseInt(entry.name.substring(0, entry.name.length - 5));
      const subDir = Math.floor(tile / 1000);
      if (!created.has(subDir)) {
        created.add(subDir);
        await fs.promises.mkdir(dst + '/' + subDir);
      }
      await fs.promises.rename(src + '/' + entry.name, dst + '/' + subDir + '/' + entry.name);
    }
  }
  await srcDir.close();
}

split().catch(e => console.error(e));
