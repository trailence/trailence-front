export class ImageUtils {

  public static isJpeg(image: Uint8Array): boolean {
    return image.length > 3 &&
      image[0] === 0xFF &&
      image[1] === 0xD8 &&
      image[2] === 0xFF;
  }

}

export interface ImageInfo {
  latitude?: number;
  longitude?: number;
  dateTaken?: number;
}
