import { Trail } from '../../model/trail';
import { Track } from '../../model/track';
import { Point } from '../../model/point';
import { XmlUtils } from '../xml-utils';
import { TypeUtils } from '../type-utils';

export class GpxImporter {

  public static importGpx(file: ArrayBuffer): Trail {
    const fileContent = new TextDecoder().decode(file);
    const parser = new DOMParser();
    const doc = parser.parseFromString(fileContent, "application/xml");

    const trk = XmlUtils.getChild(doc.documentElement, 'trk');
    if (!trk) {
        throw new Error("Invalid GPX: no track found");
    }

    const trail = new Trail({updated: true});
    trail.name = XmlUtils.getChildText(trk, 'name') ?? '';
    trail.description = XmlUtils.getChildText(trk, 'desc') ?? '';

    for (const trkseg of XmlUtils.getChildren(trk, 'trkseg')) {
      const segment = trail.track.newSegment();
      for (const trkpt of XmlUtils.getChildren(trkseg, 'trkpt')) {
        const pt = this.readPoint(trkpt);
        if (pt) {
            segment.append(pt);
        }
      }
    }

    /*
    const wayPoints = XmlUtils.getChildren(doc.documentElement, 'wpt');
    for (const wayPoint of wayPoints) {
        const pt = GpxUtils.readPoint(wayPoint);
        if (!pt) {
            continue;
        }
        const nameNode = XmlUtils.getChild(wayPoint, 'name');
        const name = nameNode?.textContent ? nameNode.textContent : '';

        const wp = new WayPoint(pt, name);
        track.wayPoints.push(wp);
    }*/

    return trail;
  }

  private static readPoint(point: Element): Point | undefined {
    const lat = TypeUtils.toFloat(point.getAttribute('lat'));
    const lng = TypeUtils.toFloat(point.getAttribute('lon'));
    if (lat === undefined || lng === undefined) {
        return undefined;
    }

    const eleNode = XmlUtils.getChild(point, 'ele');
    const elevation = eleNode ? TypeUtils.toFloat(eleNode.textContent) : undefined;

    const timeNode = XmlUtils.getChild(point, 'time');
    const time = timeNode ? TypeUtils .toDate(timeNode.textContent) : undefined;

    return new Point(lat, lng, elevation, time?.getTime());
  }

}
