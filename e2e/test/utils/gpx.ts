import { TypeUtils } from '../../../src/app/utils/type-utils';
import { XmlUtils } from '../../../src/app/utils/xml-utils';

export interface GpxPoint {
  lat: number;
  lng: number;
  ele?: number;
  time?: number;
}

export async function importGpx(file: ArrayBuffer) {
  const fileContent = new TextDecoder().decode(file);
  const { JSDOM } = await import('jsdom');
  const DOMParser = new JSDOM().window.DOMParser;
  const parser = new DOMParser();
  const doc = parser.parseFromString(fileContent, "application/xml");

  const segments: GpxPoint[][] = [];

  for (const trk of XmlUtils.getChildren(doc.documentElement, 'trk')) {
    for (const trkseg of XmlUtils.getChildren(trk, 'trkseg')) {
      const segment: GpxPoint[] = [];
      segments.push(segment);
      for (const trkpt of XmlUtils.getChildren(trkseg, 'trkpt')) {
        const pt = readGpxPoint(trkpt);
        if (pt) {
          segment.push(pt);
        }
      }
    }
  }
  return segments;
}

function readGpxPoint(point: Element): GpxPoint | undefined {
  const lat = TypeUtils.toFloat(point.getAttribute('lat'));
  const lng = TypeUtils.toFloat(point.getAttribute('lon'));
  if (lat === undefined || lng === undefined) {
      return undefined;
  }

  const eleNode = XmlUtils.getChild(point, 'ele');
  const ele = eleNode ? TypeUtils.toFloat(eleNode.textContent) : undefined;

  const timeNode = XmlUtils.getChild(point, 'time');
  const time = timeNode ? TypeUtils.toDate(timeNode.textContent)?.getTime() : undefined;

  return { lat, lng, ele, time };
}
