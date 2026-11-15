export class ImageUtils {

  public static isJpeg(image: Uint8Array): boolean {
    return image.length > 3 &&
      image[0] === 0xFF &&
      image[1] === 0xD8 &&
      image[2] === 0xFF;
  }

  public static async svgToCanvas(svg: string, width: number, height: number) {
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

}

export interface ImageInfo {
  latitude?: number;
  longitude?: number;
  dateTaken?: number;
  dateTakenTzOffset?: number;
}
