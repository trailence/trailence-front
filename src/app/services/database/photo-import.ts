import { ImageInfo, ImageUtils } from '../../utils/image-utils';
import { Photo } from '../../model/photo';
import { Console } from '../../utils/console';
import { ComputedPreferences } from '../preferences/preferences';

export async function importPhoto( // NOSONAR
  owner: string, trailUuid: string,
  description: string, index: number,
  content: ArrayBuffer,
  preferences: ComputedPreferences,
  dateTaken?: number, latitude?: number, longitude?: number,
  isCover?: boolean,
  photoUuid?: string,
): Promise<{blob: Blob, photo: Photo}> {
  if (description.length > 100) description = description.substring(0, 100);
  const arr = new Uint8Array(content);
  let info: ImageInfo | undefined;
  if (ImageUtils.isJpeg(arr)) {
    if (dateTaken && latitude !== undefined && longitude !== undefined)
      info = {dateTaken, latitude, longitude};
    else {
      info = ImageUtils.extractInfos(arr);
      if (!info?.dateTaken) {
        const date = extractDateFromName(description);
        if (date) {
          if (info) info.dateTaken = date; else info = {dateTaken: date};
        }
      }
      Console.info('extracted info from image', info);
    }
  }
  const nextConvert: (s:number,q:number) => Promise<Blob> = (currentMaxSize: number, currentMaxQuality: number) =>
    ImageUtils.convertToJpeg(arr, currentMaxSize, currentMaxSize, currentMaxQuality)
    .then(jpeg => {
      if (jpeg.blob.size <= preferences.photoMaxSizeKB * 1024) return jpeg.blob;
      if (currentMaxQuality > preferences.photoMaxQuality - 0.25) return nextConvert(currentMaxSize, currentMaxQuality - 0.05);
      if (currentMaxSize > 400) return nextConvert(currentMaxSize - 100, preferences.photoMaxQuality);
      if (currentMaxQuality > 0.25) return nextConvert(currentMaxSize, currentMaxQuality - 0.05);
      if (currentMaxSize > 100) return nextConvert(currentMaxSize - 50, preferences.photoMaxQuality);
      return jpeg.blob;
    });
  const blob = await nextConvert(preferences.photoMaxPixels, preferences.photoMaxQuality);
  const photo = new Photo({
    owner,
    uuid: photoUuid,
    trailUuid,
    description,
    index,
  });
  photo.latitude = latitude ?? info?.latitude;
  photo.longitude = longitude ?? info?.longitude;
  photo.dateTaken = dateTaken ?? info?.dateTaken;
  photo.isCover = isCover ?? false;
  return {blob, photo};
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
