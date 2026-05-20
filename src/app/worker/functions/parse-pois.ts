import { POI, POIType } from '../../services/geolocation/geo.service';

export async function parsePois(blob: Blob, type: POIType, south: number, west: number, north: number, east: number): Promise<POI[]> {
  const data = new DataView(await blob.arrayBuffer());
  const textDecoder = new TextDecoder();
  const pois: POI[] = [];
  let offset = 0;
  while (offset < data.byteLength) {
    const extraLen = data.getUint16(offset, true);
    const lat = data.getInt32(offset + 2, true) / 1e7;
    const lng = data.getInt32(offset + 6, true) / 1e7;
    offset += 10;
    if (lat < south || lat > north || lng < west || lng > east) {
      offset += extraLen;
      continue;
    }
    const pos = {lat, lng};
    let text: string | undefined = undefined;
    if (extraLen > 0) {
      const textLen = data.getUint8(offset);
      if (textLen > 0) {
        text = textDecoder.decode(data.buffer.slice(offset + 1, offset + 1 + textLen));
      }
      offset += extraLen;
    }
    pois.push({
      type,
      pos,
      text
    });
  }
  return pois;
}
