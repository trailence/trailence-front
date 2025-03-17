import { TranslatedString } from '../services/i18n/i18n-string';
import { Console } from './console';
import { DataUtils } from './data-utils';
import { TypeUtils } from './type-utils';

export class ImageUtils {

  public static isJpeg(image: Uint8Array): boolean {
    return image.length > 3 &&
      image[0] === 0xFF &&
      image[1] === 0xD8 &&
      image[2] === 0xFF;
  }

  public static convertToJpeg(image: Uint8Array | Blob, maxWidth?: number, maxHeight?: number, quality?: number): Promise<{blob: Blob, width: number, height: number}> {
    return new Promise((resolve, reject) => {
      const blob = image instanceof Blob ? image : new Blob([image]);
      const img = new Image();
      const urlCreator = window.URL || window.webkitURL;
      img.onload = () => {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
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
        dw = Math.floor(dw);
        dh = Math.floor(dh);

        const canvas = document.createElement('CANVAS') as HTMLCanvasElement;
        canvas.width = dw;
        canvas.height = dh;
        canvas.style.position = 'fixed';
        canvas.style.top = (-dh - 1000) + 'px';
        canvas.style.left = (-dw - 1000) + 'px';
        document.documentElement.appendChild(canvas);
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        ctx.drawImage(img, 0, 0, width, height, 0, 0, dw, dh);
        urlCreator.revokeObjectURL(img.src);
        canvas.toBlob(
          blob => {
            if (blob) {
              resolve({blob, width: dw, height: dh});
              canvas.parentElement?.removeChild(canvas);
            } else {
              reject("Unable to generate JPEG");
            }
          },
          "image/jpeg",
          quality ?? 1
        )
      };
      img.onerror = err => {
        reject(new TranslatedString('errors.invalid_format'));
      };
      img.src = urlCreator.createObjectURL(blob);
    });

  }

  public static extractInfos(image: Uint8Array): ImageInfo | undefined {
    if (ImageUtils.isJpeg(image)) {
      return ImageUtils.extractInfosFromJpeg(image);
    }
    return undefined;
  }

  private static extractInfosFromJpeg(image: Uint8Array): ImageInfo | undefined {
    let offset = 2;
    while (offset < image.length) {
      if (image[offset] !== 0xFF) {
        Console.warn('Unexpected byte ' + image[offset] + ' at ' + offset + ': expected is 0xFF');
        break;
      }
      if (++offset >= image.length) {
        break;
      }
      switch (image[offset++]) {
        case 0xC0: case 0xC1: case 0xC2: case 0xC3:
				case 0xC5: case 0xC6: case 0xC7:
				case 0xC9: case 0xCA: case 0xCB:
				case 0xCD: case 0xCE: case 0xCF:
        case 0x01: case 0xC4: case 0xCC:
        case 0xDB: case 0xDE:
        case 0xFE: // comment
        case 0xE0: // JFIF
        case 0xE2:
        {
          if (offset + 2 > image.length) {
            offset += 2;
            break;
          }
          const size = DataUtils.readUint16BigEndian(image, offset);
          offset += size;
          break;
        }
				case 0xDA: {
          const size = DataUtils.readUint16BigEndian(image, offset);
          offset += size;
					offset = ImageUtils.skipEntropyData(image, offset);
					break;
        }
				case 0xDC:
          offset += 4;
					break;
				case 0xDD:
					offset += 2;
					break;
				case 0xDF:
					offset += 3;
					break;
				case 0xD0: case 0xD1: case 0xD2: case 0xD3: case 0xD4: case 0xD5: case 0xD6: case 0xD7: break;
				case 0xD9: return; // end of image
				case 0xE1: { // EXIF
          return ImageUtils.extractInfosFromExif(image, offset + 2);
        }
				default: {
          Console.warn("Unknown JPEG Marker "+ image[offset - 1] + " at " + (offset - 1));
					// let's do like we know this tag
					if (offset + 2 > image.length) {
            offset += 2;
            break;
          }
          const size = DataUtils.readUint16BigEndian(image, offset);
          offset += size;
          break;
        }
			}
    }
    return undefined;
  }

  private static skipEntropyData(image: Uint8Array, offset: number): number {
    while (offset < image.length) {
      if (image[offset++] === 0xFF) {
        if (image[offset++] !== 0x00)
          return offset - 2;
      }
    };
    return offset;
  }

  private static extractInfosFromExif(data: Uint8Array, offset: number): ImageInfo | undefined {
    // Exif header
    if (offset + 6 >= data.length ||
      data[offset++] !== 0x45 ||
      data[offset++] !== 0x78 ||
      data[offset++] !== 0x69 ||
      data[offset++] !== 0x66 ||
      data[offset++] !== 0x00 ||
      data[offset++] !== 0x00) {
      return undefined;
    }
    // TIFF header
    const tiffStartOffset = offset;
    if (offset + 8 >= data.length) {
      return undefined;
    }
    const littleEndian = data[offset] === 0x49 && data[offset + 1] === 0x49;
    if (!littleEndian && (data[offset] !== 0x4D || data[offset + 1] !== 0x4D)) {
      return undefined;
    }
    offset += 2;
    if (offset + 2 >= data.length || DataUtils.readUint16(data, offset, littleEndian) != 0x002A) {
      return undefined;
    }
    offset += 2;
    const info = {} as ImageInfo;
    const nextIFD = DataUtils.readUint32(data, offset, littleEndian);
    offset = tiffStartOffset + nextIFD;
    ImageUtils.extractInfosFromExifSection(data, tiffStartOffset, offset, littleEndian, info);
    return info;
  }

  private static extractInfosFromExifSection(data: Uint8Array, start: number, offset: number, littleEndian: boolean, info: ImageInfo): void {
    const nbEntries = DataUtils.readUint16(data, offset, littleEndian);
    offset += 2;
    for (let i = 0; i < nbEntries; i++) {
      const tag = DataUtils.readUint16(data, offset, littleEndian);
      offset += 2;
      // format
      DataUtils.readUint16(data, offset, littleEndian);
      offset += 2;
      const nbComponents = DataUtils.readUint32(data, offset, littleEndian);
      offset += 4;
      const addressOrValue = DataUtils.readUint32(data, offset, littleEndian);
      offset += 4;
      if (tag === 0x8825) {
        // GPS Info
        const gps = ImageUtils.extractLatLngFromExifGpsInfo(data, start, start + addressOrValue, littleEndian);
        info.latitude = gps?.lat;
        info.longitude = gps?.lng;
      }
      if (tag === 0x8769) {
        // EXIF
        this.extractInfosFromExifSection(data, start, start + addressOrValue, littleEndian, info);
      }
      if (tag === 0x9003) {
        // date/time original
        const str = this.readExifString(data, start + addressOrValue, nbComponents);
        const date = ImageUtils.toDate(str);
        info.dateTaken = date?.getTime();
      }
    }
  }

  private static toDate(str: string): Date | undefined {
    if (str.length === 0) return;
    const datetime = str.split(' ');
    if (datetime.length !== 2) return;
    const d = datetime[0].split(':');
    if (d.length !== 3) return;
    const year = parseInt(d[0]);
    const month = parseInt(d[1]);
    const day = parseInt(d[2]);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day) && month > 0 && month < 13 && day > 0 && day < 32) {
      const t = datetime[1].split(':');
      if (t.length === 3) {
        const hour = parseInt(t[0]);
        const minute = parseInt(t[1]);
        const second = parseInt(t[2]);
        if (!isNaN(hour) && !isNaN(minute) && !isNaN(second) && hour >= 0 && hour < 24 && minute >= 0 && minute < 60 && second >= 0 && second < 60) {
          return new Date(year, month - 1, day, hour, minute, second);
        }
      }
    }
    return undefined;
  }

  private static readExifString(data: Uint8Array, offset: number, size: number): string {
    let s = '';
    for (let i = 0; i < size; ++i) {
      if (data[offset + i] === 0) return s;
      s += String.fromCharCode(data[offset + i]);
    }
    return s;
  }

  private static extractLatLngFromExifGpsInfo(data: Uint8Array, start: number, offset: number, littleEndian: boolean): {lat: number, lng: number} | undefined {
    const nbEntries = DataUtils.readUint16(data, offset, littleEndian);
    offset += 2;
    let latRef = undefined;
    let lat = undefined;
    let lngRef = undefined;
    let lng = undefined;
    for (let i = 0; i < nbEntries; i++) {
      const tag = DataUtils.readUint16(data, offset, littleEndian);
      offset += 2;
      const format = DataUtils.readUint16(data, offset, littleEndian);
      offset += 2;
      const nbComponents = DataUtils.readUint32(data, offset, littleEndian);
      offset += 4;
      const addressOrValue = DataUtils.readUint32(data, offset, littleEndian);
      offset += 4;
      if (tag === 0x0001) {
        latRef = data[offset - 4];
      } else if (tag === 0x0003) {
        lngRef = data[offset - 4];
      } else if (tag === 0x0002 && format === 5 && nbComponents === 3) {
        lat = [
          DataUtils.readUint32(data, start + addressOrValue, littleEndian),
          DataUtils.readUint32(data, start + addressOrValue + 4, littleEndian),
          DataUtils.readUint32(data, start + addressOrValue + 8, littleEndian),
          DataUtils.readUint32(data, start + addressOrValue + 12, littleEndian),
          DataUtils.readUint32(data, start + addressOrValue + 16, littleEndian),
          DataUtils.readUint32(data, start + addressOrValue + 20, littleEndian),
        ];
      } else if (tag === 0x0004 && format === 5 && nbComponents === 3) {
        lng = [
          DataUtils.readUint32(data, start + addressOrValue, littleEndian),
          DataUtils.readUint32(data, start + addressOrValue + 4, littleEndian),
          DataUtils.readUint32(data, start + addressOrValue + 8, littleEndian),
          DataUtils.readUint32(data, start + addressOrValue + 12, littleEndian),
          DataUtils.readUint32(data, start + addressOrValue + 16, littleEndian),
          DataUtils.readUint32(data, start + addressOrValue + 20, littleEndian),
        ];
      }
    }
    if (latRef && lat && lngRef && lng) {
      return {
        lat: TypeUtils.convertDMSToDD(String.fromCharCode(latRef), lat[0] / lat[1], lat[2] / lat[3], lat[4] / lat[5]),
        lng: TypeUtils.convertDMSToDD(String.fromCharCode(lngRef), lng[0] / lng[1], lng[2] / lng[3], lng[4] / lng[5]),
      }
    }
    return undefined;
  }

}

export interface ImageInfo {
  latitude?: number;
  longitude?: number;
  dateTaken?: number;
}
