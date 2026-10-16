import { getLogger } from '@trailence/utils/console';
import { convertDMSToDD } from '@trailence/utils/coordinates-parser';
import { ImageInfo, ImageUtils } from '@trailence/utils/image-utils';
import { EXISTING_TIMEZONES } from '@trailence/utils/timezones';

const logger = getLogger('extract-image-infos');

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
      logger.warn('Unexpected byte ' + image[offset] + ' at ' + offset + ': expected is 0xFF');
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
        return toImageInfo(extractInfosFromExif(image, offset + 2, data));
      }
      default: {
        logger.warn("Unknown JPEG Marker "+ image[offset - 1] + " at " + (offset - 1));
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

interface ImageInfoInternal {
  latitude?: number;
  longitude?: number;
  gpsDateUtc?: number;
  dateTakenOriginal?: DateTimeNoTimezone;
  dateTakenOriginalTzOffset?: number;
  legacyTimezoneOffsetHours?: number;
}

function toImageInfo(internal: ImageInfoInternal | undefined): ImageInfo | undefined {
  if (!internal) return undefined;
  const info = {} as ImageInfo;
  info.latitude = internal.latitude;
  info.longitude = internal.longitude;
  console.log(internal); // TODO
  if (internal.dateTakenOriginal !== undefined) {
    if (internal.dateTakenOriginalTzOffset !== undefined) {
      console.log('using tz offset original'); // TODO
      info.dateTakenTzOffset = internal.dateTakenOriginalTzOffset;
      info.dateTaken = internal.dateTakenOriginal.withTzOffset(internal.dateTakenOriginalTzOffset);
    }
    if (info.dateTakenTzOffset === undefined && internal.gpsDateUtc !== undefined) {
      // we may guess the timezone my doing a diff between the 2 dates
      const diffMinutes = Math.floor((internal.dateTakenOriginal.asUTC() - internal.gpsDateUtc) / 60000);
      let bestTzIndex: number | undefined = undefined;
      let bestTzDiff: number = 0;
      for (let i = 0; i < EXISTING_TIMEZONES.length; ++i) {
        const tzOffset = EXISTING_TIMEZONES[i];
        const diff = Math.abs(tzOffset - diffMinutes);
        if (bestTzIndex === undefined || (diff < bestTzDiff)) {
          bestTzIndex = i;
          bestTzDiff = diff;
        }
      }
      if (bestTzIndex !== undefined && bestTzDiff < 15) {
        console.log('using diff from gps', EXISTING_TIMEZONES[bestTzIndex]); // TODO
        info.dateTakenTzOffset = EXISTING_TIMEZONES[bestTzIndex];
        info.dateTaken = internal.dateTakenOriginal.withTzOffset(info.dateTakenTzOffset);
      }
    }
    if (info.dateTakenTzOffset === undefined && internal.legacyTimezoneOffsetHours !== undefined) {
      console.log('using legacy tz'); // TODO
      info.dateTakenTzOffset = internal.legacyTimezoneOffsetHours * 60;
      info.dateTaken = internal.dateTakenOriginal.withTzOffset(info.dateTakenTzOffset);
    }
    if (info.dateTakenTzOffset === undefined) {
      // no timezone info => default to user timezone
      console.log('using user timezone'); // TODO
      info.dateTaken = internal.dateTakenOriginal.inUserTimezone();
    }
  }
  return (info.latitude === undefined && info.longitude !== undefined) || info.dateTaken !== undefined ? info : undefined;
}

function extractInfosFromExif(data: Uint8Array, offset: number, view: DataView): ImageInfoInternal | undefined {
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
  const info = {} as ImageInfoInternal;
  const nextIFD = view.getUint32(offset, littleEndian);
  offset = tiffStartOffset + nextIFD;
  extractInfosFromExifSection(data, tiffStartOffset, offset, littleEndian, info, view);
  return info;
}

function extractInfosFromExifSection(data: Uint8Array, start: number, offset: number, littleEndian: boolean, info: ImageInfoInternal, view: DataView): void {
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
    switch (tag) {
      case 0x8769:
        // EXIF
        extractInfosFromExifSection(data, start, start + addressOrValue, littleEndian, info, view);
        break;
      case 0x8825: {
        // GPS Info
        const gps = extractLatLngFromExifGpsInfo(data, start, start + addressOrValue, littleEndian, view);
        info.latitude = gps?.position?.lat;
        info.longitude = gps?.position?.lng;
        info.gpsDateUtc = gps?.dateUtc;
        break;
      }
      case 0x882A: {
        // TimeZoneOffset
        if (nbComponents === 1 || nbComponents === 2)
          info.legacyTimezoneOffsetHours = view.getInt16(offset - 4, littleEndian);
        break;
      }
      case 0x9003: {
        // date/time original
        const str = readExifString(data, start + addressOrValue, nbComponents);
        info.dateTakenOriginal = toDateTimeNoTimezone(str);
        break;
      }
      case 0x9011: {
        // timezone original
        const str = readExifString(data, start + addressOrValue, nbComponents);
        info.dateTakenOriginalTzOffset = toTimezoneOffset(str);
        break;
      }
    }
  }
}

class DateTimeNoTimezone {
  constructor(
    private readonly year: number,
    private readonly month: number,
    private readonly day: number,
    private readonly hours: number,
    private readonly minutes: number,
    private readonly seconds: number,
  ) {}

  asUTC(): number {
    return Date.UTC(this.year, this.month, this.day, this.hours, this.minutes, this.seconds);
  }

  withTzOffset(minutes: number): number {
    return this.asUTC() - minutes * 60000;
  }

  inUserTimezone(): number {
    return new Date(this.year, this.month, this.day, this.hours, this.minutes, this.seconds).getTime();
  }
}

function toDateTimeNoTimezone(str: string): DateTimeNoTimezone | undefined {
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
        return new DateTimeNoTimezone(year, month - 1, day, hour, minute, second);
      }
    }
  }
  return undefined;
}

function toTimezoneOffset(str: string): number | undefined {
  if (str.length !== 6 || str[3] !== ':') return undefined;
  const sign = str[0] === '+' ? 1 : (str[0] === '-' ? -1 : undefined); // NOSONAR
  if (sign === undefined) return undefined;
  const hours = Number.parseInt(str.substring(1, 3));
  const minutes = Number.parseInt(str.substring(4));
  if (!Number.isNaN(hours) && !Number.isNaN(minutes)) return (hours * 60 + minutes) * sign;
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

function extractLatLngFromExifGpsInfo(
  data: Uint8Array, start: number, offset: number, littleEndian: boolean, view: DataView
): {position: {lat: number, lng: number} | undefined, dateUtc: number | undefined}
{
  const nbEntries = view.getUint16(offset, littleEndian);
  offset += 2;
  let latRef = undefined;
  let lat = undefined;
  let lngRef = undefined;
  let lng = undefined;
  let timestampSeconds: number | undefined = undefined;
  let date: {year: number, month: number, day: number} | undefined = undefined;
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
    } else if (tag === 0x0007 && format === 5 && nbComponents === 3) {
      const hoursNumerator = view.getUint32(start + addressOrValue, littleEndian);
      const hoursDenominator = view.getUint32(start + addressOrValue + 4, littleEndian);
      const minutesNumerator = view.getUint32(start + addressOrValue + 8, littleEndian);
      const minutesDenominator = view.getUint32(start + addressOrValue + 12, littleEndian);
      const secondsNumerator = view.getUint32(start + addressOrValue + 16, littleEndian);
      const secondsDenominator = view.getUint32(start + addressOrValue + 20, littleEndian);
      timestampSeconds = Math.floor((secondsNumerator / secondsDenominator) + (minutesNumerator / minutesDenominator) * 60 + (hoursNumerator / hoursDenominator) * 60 * 60);
    } else if (tag === 0x001D && format === 2) {
      const str = readExifString(data, start + addressOrValue, nbComponents);
      const d = str.split(':');
      if (d.length === 3) {
        const year = Number.parseInt(d[0]);
        const month = Number.parseInt(d[1]);
        const day = Number.parseInt(d[2]);
        if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day) && month > 0 && month < 13 && day > 0 && day < 32) {
          date = {year, month, day};
        }
      }
    }
  }
  let position: {lat: number, lng: number} | undefined = undefined;
  if (latRef && lat && lngRef && lng) {
    position = {
      lat: convertDMSToDD(String.fromCharCode(latRef), lat[0] / lat[1], lat[2] / lat[3], lat[4] / lat[5]), // NOSONAR
      lng: convertDMSToDD(String.fromCharCode(lngRef), lng[0] / lng[1], lng[2] / lng[3], lng[4] / lng[5]), // NOSONAR
    }
  }
  let dateUtc: number | undefined = undefined;
  if (timestampSeconds !== undefined && date !== undefined)
    dateUtc = Date.UTC(date.year, date.month - 1, date.day, Math.floor(timestampSeconds / (60 * 60)), Math.floor((timestampSeconds % (60 * 60)) / 60), timestampSeconds % 60);
  return { position, dateUtc };
}
