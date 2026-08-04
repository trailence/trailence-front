import fs from "node:fs";
import path from "node:path";
import { createCanvas, loadImage } from "canvas";
import GIFEncoder from "gifencoder";
import { AvailableLocales } from '../../../src/app/services/i18n/available-locales';

if (process.argv.length < 3) {
  console.log('Usage: deploy_demo <ssversion>');
  console.log('No screenshot version found.')
  throw new Error('No screenshot version found: invalid usage');
}

const ssVersion = process.argv[2];

const sourcePath = '../../output';
const homePagePath = '../../../src/assets/home-ss/ss.' + ssVersion;
const fastlanePath = '../../../fastlane/metadata/android';

async function pngToJpeg(sourceFile: string, targetFile: string, targetWidth: number, targetHeight: number, quality: number) {
  const img = await loadImage(sourceFile);

  const canvas = createCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext("2d");

  ctx.imageSmoothingEnabled = true;

  // JPEG doesn't support transparency, so fill the background.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // Stretch to the requested size.
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  fs.mkdirSync(path.dirname(targetFile), { recursive: true });

  await fs.promises.writeFile(
    targetFile,
    canvas.toBuffer("image/jpeg", {
      quality,
      progressive: true,
    })
  );
}

async function homePageGif(source: string, nbFrames: number, target: string, targetWidth: number, targetHeight: number, frameDelayMs: number, finalDelayMs: number) {
  console.log('Creating animated gif from ' + source + ' (' + nbFrames + ') to ' + target);
  const encoder = new GIFEncoder(targetWidth, targetHeight);

  const outputPath = homePagePath + '/' + target + '.gif';
  const writeStream = fs.createWriteStream(outputPath);
  encoder.createReadStream().pipe(writeStream);

  encoder.start();
  encoder.setRepeat(0); // Loop forever
  encoder.setQuality(1);

  const canvas = createCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext("2d");

  // Better image scaling quality
  ctx.imageSmoothingEnabled = true;
  ctx.quality = "good";

  for (let i = 1; i <= nbFrames; i++) {
    const frameSource = sourcePath + '/' + source + '_' + i + '.png';
    console.log(' + Frame ' + i + ' from ' + frameSource);
    const img = await loadImage(frameSource);

    ctx.clearRect(0, 0, targetWidth, targetHeight);

    // Stretch to exactly the requested size
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    encoder.setDelay(i === nbFrames ? finalDelayMs : frameDelayMs);

    encoder.addFrame(ctx as any);
  }

  encoder.finish();
  await new Promise<void>((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });
  console.log('animated gif saved to ' + outputPath);
}

async function homePage(source: string, size: 'mobile' | 'desktop', target: string, targetWidth: number, targetHeight: number, quality: number) {
  for (const theme of ['dark', 'light']) {
    await pngToJpeg(
      sourcePath + '/' + source + '.en.' + size + '.' + theme + '.png',
      homePagePath + '/' + target + '.en.' + size + '.' + theme + '.jpg',
      targetWidth, targetHeight, quality
    );
  }
}

function getFastlaneLang(lang: string): string {
  switch (lang) {
    case 'de': return 'de-DE';
    case 'en': return 'en-US';
    case 'es': return 'es-ES';
    case 'fr': return 'fr-FR';
    case 'it': return 'it';
    case 'pt': return 'pt-PT';
    default: throw new Error('Unknown fastlane language for ' + lang);
  }
}

function emptyDirectory(path: string) {
  const dir = fs.opendirSync(path);
  let entry;
  while ((entry = dir.readSync()) !== null) {
    if (entry.isFile()) fs.unlinkSync(path + '/' + entry.name);
  }
  dir.closeSync();
}

async function deploy() {
  // 350 x 600 => 165.4 x 264.61
  await homePageGif('ss_trace_gif', 65, 'mobile_trace_recording', 175, 300, 125, 5_000);
  await homePage('ss_feature_1', 'desktop', 'hero', 512, 250, 0.75);
  await homePage('ss_trace_1', 'mobile', 'trace', 187, 320, 0.8);
  await homePage('ss_collection_1', 'desktop', 'collection', 700, 341, 0.75);
  await homePage('ss_trail-details_1', 'mobile', 'trail_details', 187, 320, 0.8);
  await homePage('ss_photos-on-map_1', 'mobile', 'trail_with_photos', 187, 320, 0.8);
  for (const lang of Object.values(AvailableLocales)) {
    const fastlaneDir = getFastlaneLang(lang.key);
    fs.copyFileSync(sourcePath + '/ss_feature_1.' + lang.key + '.desktop.dark.png', fastlanePath + '/' + fastlaneDir + '/images/featureGraphic.png');
    emptyDirectory(fastlanePath + '/' + fastlaneDir + '/images/phoneScreenshots');
    fs.copyFileSync(sourcePath + '/ss_collection_1.' + lang.key + '.mobile.light.png', fastlanePath + '/' + fastlaneDir + '/images/phoneScreenshots/1.png');
    fs.copyFileSync(sourcePath + '/ss_collection_2.' + lang.key + '.mobile.dark.png', fastlanePath + '/' + fastlaneDir + '/images/phoneScreenshots/2.png');
    fs.copyFileSync(sourcePath + '/ss_trail-details_1.' + lang.key + '.mobile.light.png', fastlanePath + '/' + fastlaneDir + '/images/phoneScreenshots/3.png');
    fs.copyFileSync(sourcePath + '/ss_trail-details_2.' + lang.key + '.mobile.dark.png', fastlanePath + '/' + fastlaneDir + '/images/phoneScreenshots/4.png');
    fs.copyFileSync(sourcePath + '/ss_trace_1.' + lang.key + '.mobile.light.png', fastlanePath + '/' + fastlaneDir + '/images/phoneScreenshots/5.png');
    fs.copyFileSync(sourcePath + '/ss_photos-on-map_1.' + lang.key + '.mobile.dark.png', fastlanePath + '/' + fastlaneDir + '/images/phoneScreenshots/6.png');
  }
}

deploy()
.then(() => {
  console.log('Done.')
  process.exit(0);
})
.catch(e => {
  console.error(e);
  process.exit(1);
});
