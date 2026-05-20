import { Console } from 'src/app/utils/console';

export async function convertToJpeg(image: Blob, maxWidth?: number, maxHeight?: number, quality?: number, minWidth?: number, minHeight?: number): Promise<{jpeg: ArrayBuffer, width: number, height: number}> {
  let img: ImageBitmap;
  try {
    img = await createImageBitmap(image);
  } catch (e) {
    Console.warn('Error loading photo', e);
    throw {i18nKey: 'errors.invalid_format'};
  }
  const width = img.width;
  const height = img.height;
  let dw = width;
  let dh = height;
  if (maxWidth && dw > maxWidth) {
    dw = maxWidth;
    dh = height * (maxWidth / width);
  }
  if (maxHeight && dh > maxHeight) {
    const ratio = maxHeight / dh;
    dh = maxHeight;
    dw *= ratio;
  }
  if (minWidth && dw < minWidth) {
    dw = minWidth;
    dh = height * (minWidth / width);
  }
  if (minHeight && dh < minHeight) {
    const ratio = minHeight / dh;
    dh = minHeight;
    dw *= ratio;
  }
  dw = Math.floor(dw);
  dh = Math.floor(dh);

  const canvas = new OffscreenCanvas(dw, dh);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, width, height, 0, 0, dw, dh);

  const result = await canvas.convertToBlob({
    type: 'image/jpeg',
    quality: quality ?? 1,
  });
  const jpeg = await result.arrayBuffer();
  return {jpeg, width: dw, height: dh};
}
