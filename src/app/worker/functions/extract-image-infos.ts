import { Console } from 'src/app/utils/console';
import { convertDMSToDD } from 'src/app/utils/coordinates-parser';
import { ImageInfo, ImageUtils } from 'src/app/utils/image-utils';

export function extractInfos(image: Uint8Array): ImageInfo | undefined {
  if (ImageUtils.isJpeg(image)) {
    return extractInfosFromJpeg(image);
  }
  return undefined;
}

function extractInfosFromJpeg(image: Uint8Array): ImageInfo | undefined {
  const data = new DataView(image.buffer);
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
        const size = data.getUint16(offset, false);
        offset += size;
        break;
      }
      case 0xDA: {
        const size = data.getUint16(offset, false);
        offset += size;
        offset = skipEntropyData(image, offset);
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
        return extractInfosFromExif(image, offset + 2, data);
      }
      default: {
        Console.warn("Unknown JPEG Marker "+ image[offset - 1] + " at " + (offset - 1));
        // let's do like we know this tag
        if (offset + 2 > image.length) {
          offset += 2;
          break;
        }
        const size = data.getUint16(offset, false);
        offset += size;
        break;
      }
    }
  }
  return undefined;
}

function skipEntropyData(image: Uint8Array, offset: number): number {
  while (offset < image.length) {
    if (image[offset++] === 0xFF) {
      if (image[offset++] !== 0x00)
        return offset - 2;
    }
  };
  return offset;
}

function extractInfosFromExif(data: Uint8Array, offset: number, view: DataView): ImageInfo | undefined {
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
  if (offset + 2 >= data.length || view.getUint16(offset, littleEndian) != 0x002A) {
    return undefined;
  }
  offset += 2;
  const info = {} as ImageInfo;
  const nextIFD = view.getUint32(offset, littleEndian);
  offset = tiffStartOffset + nextIFD;
  extractInfosFromExifSection(data, tiffStartOffset, offset, littleEndian, info, view);
  return info;
}

function extractInfosFromExifSection(data: Uint8Array, start: number, offset: number, littleEndian: boolean, info: ImageInfo, view: DataView): void {
  const nbEntries = view.getUint16(offset, littleEndian);
  offset += 2;
  for (let i = 0; i < nbEntries; i++) {
    const tag = view.getUint16(offset, littleEndian);
    offset += 2;
    // format
    //view.getUint16(offset, littleEndian);
    offset += 2;
    const nbComponents = view.getUint32(offset, littleEndian);
    offset += 4;
    const addressOrValue = view.getUint32(offset, littleEndian);
    offset += 4;
    if (tag === 0x8825) {
      // GPS Info
      const gps = extractLatLngFromExifGpsInfo(data, start, start + addressOrValue, littleEndian, view);
      info.latitude = gps?.lat;
      info.longitude = gps?.lng;
    }
    if (tag === 0x8769) {
      // EXIF
      extractInfosFromExifSection(data, start, start + addressOrValue, littleEndian, info, view);
    }
    if (tag === 0x9003) {
      // date/time original
      const str = readExifString(data, start + addressOrValue, nbComponents);
      info.dateTaken = toDate(str);
    }
  }
}

function toDate(str: string): number | undefined {
  if (str.length === 0) return;
  const datetime = str.split(' ');
  if (datetime.length !== 2) return;
  const d = datetime[0].split(':');
  if (d.length !== 3) return;
  const year = Number.parseInt(d[0]);
  const month = Number.parseInt(d[1]);
  const day = Number.parseInt(d[2]);
  if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day) && month > 0 && month < 13 && day > 0 && day < 32) {
    const t = datetime[1].split(':');
    if (t.length === 3) {
      const hour = Number.parseInt(t[0]);
      const minute = Number.parseInt(t[1]);
      const second = Number.parseInt(t[2]);
      if (!Number.isNaN(hour) && !Number.isNaN(minute) && !Number.isNaN(second) && hour >= 0 && hour < 24 && minute >= 0 && minute < 60 && second >= 0 && second < 60) {
        return new Date(year, month - 1, day, hour, minute, second).getTime();
      }
    }
  }
  return undefined;
}

function readExifString(data: Uint8Array, offset: number, size: number): string {
  let s = '';
  for (let i = 0; i < size; ++i) {
    if (data[offset + i] === 0) return s;
    s += String.fromCharCode(data[offset + i]); // NOSONAR
  }
  return s;
}

function extractLatLngFromExifGpsInfo(data: Uint8Array, start: number, offset: number, littleEndian: boolean, view: DataView): {lat: number, lng: number} | undefined {
  const nbEntries = view.getUint16(offset, littleEndian);
  offset += 2;
  let latRef = undefined;
  let lat = undefined;
  let lngRef = undefined;
  let lng = undefined;
  for (let i = 0; i < nbEntries; i++) {
    const tag = view.getUint16(offset, littleEndian);
    offset += 2;
    const format = view.getUint16(offset, littleEndian);
    offset += 2;
    const nbComponents = view.getUint32(offset, littleEndian);
    offset += 4;
    const addressOrValue = view.getUint32(offset, littleEndian);
    offset += 4;
    if (tag === 0x0001) {
      latRef = data[offset - 4];
    } else if (tag === 0x0003) {
      lngRef = data[offset - 4];
    } else if (tag === 0x0002 && format === 5 && nbComponents === 3) {
      lat = [
        view.getUint32(start + addressOrValue, littleEndian),
        view.getUint32(start + addressOrValue + 4, littleEndian),
        view.getUint32(start + addressOrValue + 8, littleEndian),
        view.getUint32(start + addressOrValue + 12, littleEndian),
        view.getUint32(start + addressOrValue + 16, littleEndian),
        view.getUint32(start + addressOrValue + 20, littleEndian),
      ];
    } else if (tag === 0x0004 && format === 5 && nbComponents === 3) {
      lng = [
        view.getUint32(start + addressOrValue, littleEndian),
        view.getUint32(start + addressOrValue + 4, littleEndian),
        view.getUint32(start + addressOrValue + 8, littleEndian),
        view.getUint32(start + addressOrValue + 12, littleEndian),
        view.getUint32(start + addressOrValue + 16, littleEndian),
        view.getUint32(start + addressOrValue + 20, littleEndian),
      ];
    }
  }
  if (latRef && lat && lngRef && lng) {
    return {
      lat: convertDMSToDD(String.fromCharCode(latRef), lat[0] / lat[1], lat[2] / lat[3], lat[4] / lat[5]), // NOSONAR
      lng: convertDMSToDD(String.fromCharCode(lngRef), lng[0] / lng[1], lng[2] / lng[3], lng[4] / lng[5]), // NOSONAR
    }
  }
  return undefined;
}
