import { PhotoDto } from 'src/app/model/dto/photo';
import { ComputedPreferences } from 'src/app/services/preferences/preferences';
import { ImageInfo } from 'src/app/utils/image-utils';
import { extractInfos } from './extract-image-infos';
import { Console } from 'src/app/utils/console';
import { convertToJpeg } from './image-to-jpeg';

export async function importPhoto( // NOSONAR
  owner: string, trailUuid: string,
  description: string, index: number,
  content: ArrayBuffer,
  preferences: ComputedPreferences,
  dateTaken?: number, latitude?: number, longitude?: number,
  isCover?: boolean,
  photoUuid?: string,
): Promise<{jpeg: ArrayBuffer, photo: Partial<PhotoDto>}> {
  if (description.length > 100) description = description.substring(0, 100);
  const arr = new Uint8Array(content);
  let info: ImageInfo | undefined = undefined;
  if (dateTaken && latitude !== undefined && longitude !== undefined) {
    info = {dateTaken, latitude, longitude};
  } else {
    info = extractInfos(arr);
    if (!info?.dateTaken) {
      const date = extractDateFromName(description);
      if (date) {
        if (info) info.dateTaken = date; else info = {dateTaken: date};
      }
    }
    Console.info('extracted info from image', info);
  }
  const nextConvert: (s:number,q:number) => Promise<ArrayBuffer> = (currentMaxSize: number, currentMaxQuality: number) => {
    Console.info('Converting image (size ' + arr.byteLength + ') to JPEG with maximum size', currentMaxSize, 'and quality', currentMaxQuality);
    return convertToJpeg(new Blob([arr]), currentMaxSize, currentMaxSize, currentMaxQuality)
    .then(jpeg => {
      if (jpeg.jpeg.byteLength <= preferences.photoMaxSizeKB * 1024) return jpeg.jpeg;
      Console.info('Photo larger than', preferences.photoMaxSizeKB, 'KB: ', Math.floor(jpeg.jpeg.byteLength / 1024));
      if (currentMaxQuality > preferences.photoMaxQuality - 0.25) {
        Console.info('Try reducing quality to', currentMaxQuality - 0.05);
        return nextConvert(currentMaxSize, currentMaxQuality - 0.05);
      }
      if (currentMaxSize > 400) {
        Console.info('Try reducing size to', currentMaxSize - 100);
        return nextConvert(currentMaxSize - 100, preferences.photoMaxQuality / 100);
      }
      if (currentMaxQuality > 0.25) {
        Console.info('Try reducing quality to', currentMaxQuality - 0.05);
        return nextConvert(currentMaxSize, currentMaxQuality - 0.05);
      }
      if (currentMaxSize > 100) {
        Console.info('Try reducing size to', currentMaxSize - 50);
        return nextConvert(currentMaxSize - 50, preferences.photoMaxQuality / 100);
      }
      Console.info('Cannot reduce more...');
      return jpeg.jpeg;
    });
  };
  const jpeg = await nextConvert(preferences.photoMaxPixels, preferences.photoMaxQuality / 100);
  latitude = latitude ?? info?.latitude;
  if (latitude !== undefined && latitude !== null) latitude = Math.floor(latitude * 1e7);
  longitude = longitude ?? info?.longitude;
  if (longitude !== undefined && longitude !== null) longitude = Math.floor(longitude * 1e7);
  return {
    jpeg,
    photo: {
      owner,
      uuid: photoUuid,
      trailUuid,
      description,
      index,
      latitude,
      longitude,
      dateTaken: dateTaken ?? info?.dateTaken,
      isCover: isCover ?? false,
    }
  };
}

function extractDateFromName(name: string): number | undefined {
  const regex = /.*(\d{4})([0-1]\d)([0-3]\d).?([0-2]\d)([0-5]\d)([0-5]\d).*/;
  const dateMatch = regex.exec(name.length > 200 ? name.substring(0, 200) : name);
  if (!dateMatch) return undefined;
  const year = dateMatch[1] ? Number.parseInt(dateMatch[1]) : undefined;
  if (!year || Number.isNaN(year) || year < 1900) return undefined;
  const month = dateMatch[2] ? Number.parseInt(dateMatch[2]) : undefined;
  if (!month || Number.isNaN(month) || month < 1 || month > 12) return undefined;
  const day = dateMatch[3] ? Number.parseInt(dateMatch[3]) : undefined;
  if (!day || Number.isNaN(day) || day < 1 || day > 31) return undefined;
  const hour = dateMatch[4] ? Number.parseInt(dateMatch[4]) : undefined;
  if (!hour || Number.isNaN(hour) || hour < 1 || hour > 23) return undefined;
  const minute = dateMatch[5] ? Number.parseInt(dateMatch[5]) : undefined;
  if (minute === undefined || Number.isNaN(minute) || minute < 0 || minute > 59) return undefined;
  const second = dateMatch[6] ? Number.parseInt(dateMatch[6]) : undefined;
  if (second === undefined || Number.isNaN(second) || second < 0 || second > 59) return undefined;
  const date = new Date(year, month - 1, day, hour, minute, second).getTime();
  return date;
}
