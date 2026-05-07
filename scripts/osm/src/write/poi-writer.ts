import { Guidepost, Toilets } from '../model/pois';
import { TilesWriter } from './tiles-writer';

export async function guidepostToBin(guidepost: Guidepost, tile: number, tiles: TilesWriter): Promise<boolean> {
  const text = guidepost.text?.length ? limitText(guidepost.text, 255) : undefined;
  const textLength = text ? text.length : 0;
  const size = 2 + 4 + 4 + (textLength > 0 ? 1 + textLength : 0);
  const buffer = await tiles.getTileBuffer(tile, size);
  buffer.writeUInt16(textLength > 0 ? textLength + 1 : 0);
  buffer.writeInt32(Math.round(guidepost.lat * 1e7));
  buffer.writeInt32(Math.round(guidepost.lon * 1e7));
  if (!text) return true;
  buffer.writeUInt8(textLength);
  buffer.write(text);
  return true;
}

export async function toiletsToBin(toilets: Toilets, tile: number, tiles: TilesWriter): Promise<boolean> {
  const buffer = await tiles.getTileBuffer(tile, 2 + 4 + 4);
  buffer.writeUInt16(0);
  buffer.writeInt32(Math.round(toilets.lat * 1e7));
  buffer.writeInt32(Math.round(toilets.lon * 1e7));
  return true;
}

export async function drinkingWaterToBin(water: Toilets, tile: number, tiles: TilesWriter): Promise<boolean> {
  const buffer = await tiles.getTileBuffer(tile, 2 + 4 + 4);
  buffer.writeUInt16(0);
  buffer.writeInt32(Math.round(water.lat * 1e7));
  buffer.writeInt32(Math.round(water.lon * 1e7));
  return true;
}

function limitText(text: string, limit: number): Buffer {
  do {
    const b = Buffer.from(text, 'utf8');
    if (b.length <= limit) return b;
    text = text.substring(0, text.length - (b.length - limit));
  } while (true);
}
