import { Trail } from '../../model/trail';
import { Track } from '../../model/track';
import { Point } from '../../model/point';
import { XmlUtils } from '../xml-utils';
import { TypeUtils } from '../type-utils';
import { WayPoint } from 'src/app/model/way-point';
import { TrailDto } from 'src/app/model/dto/trail';
import { BinaryContent } from '../binary-content';

export class GpxFormat {

  public static importGpx(file: ArrayBuffer, user: string, collectionUuid: string): {trail: Trail, tracks: Track[]} | undefined {
    const fileContent = new TextDecoder().decode(file);
    const parser = new DOMParser();
    const doc = parser.parseFromString(fileContent, "application/xml");

    const trailDto = {owner: user, collectionUuid, name: '', description: ''} as TrailDto;
    const tracks: Track[] = [];

    const metadata = XmlUtils.getChild(doc.documentElement, 'metadata');
    if (metadata) {
      const name = XmlUtils.getChildText(metadata, 'name');
      if (name && name.length > 0) trailDto.name = name;
      const desc = XmlUtils.getChildText(metadata, 'desc');
      if (desc && desc.length > 0) trailDto.description = desc;
    }

    for (const trk of XmlUtils.getChildren(doc.documentElement, 'trk')) {
      if (trailDto.name!.length === 0)
        trailDto.name = XmlUtils.getChildText(trk, 'name') ?? '';
      if (trailDto.description!.length === 0)
        trailDto.description = XmlUtils.getChildText(trk, 'desc') ?? '';

      const track = new Track({owner: user});
      for (const trkseg of XmlUtils.getChildren(trk, 'trkseg')) {
        const segment = track.newSegment();
        for (const trkpt of XmlUtils.getChildren(trkseg, 'trkpt')) {
          const pt = this.readPoint(trkpt);
          if (pt) {
              segment.append(pt);
          }
        }
      }
      const extensions = XmlUtils.getChild(trk, 'extensions');
      if (extensions) {
        for (const wpt of XmlUtils.getChildren(extensions, 'wpt')) {
          const wp = this.readWayPoint(wpt);
          if (wp) track.appendWayPoint(wp);
        }
      }
      tracks.push(track);
    }

    if (tracks.length > 0 && tracks[tracks.length - 1].wayPoints.length === 0) {
      const track = tracks[tracks.length - 1];
      for (const wpt of XmlUtils.getChildren(doc.documentElement, 'wpt')) {
        const wp = this.readWayPoint(wpt);
        if (wp) track.appendWayPoint(wp);
      }
    }

    if (tracks.length === 0) return undefined;
    const trail = new Trail({...trailDto, originalTrackUuid: tracks[0].uuid, currentTrackUuid: tracks[tracks.length - 1].uuid});

    return { trail, tracks };
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
    const time = timeNode ? TypeUtils.toDate(timeNode.textContent) : undefined;

    const hdopNode = XmlUtils.getChild(point, 'hdop');
    const hdop = hdopNode ? TypeUtils.toFloat(hdopNode.textContent) : undefined;

    const vdopNode = XmlUtils.getChild(point, 'vdop');
    const vdop = vdopNode ? TypeUtils.toFloat(vdopNode.textContent) : undefined;

    let heading = undefined;
    let speed = undefined;

    const extensions = XmlUtils.getChild(point, 'extensions');
      if (extensions) {
        const headingNode = XmlUtils.getChild(extensions, 'heading');
        heading = headingNode ? TypeUtils.toFloat(headingNode.textContent) : undefined;

        const speedNode = XmlUtils.getChild(extensions, 'speed');
        speed = speedNode ? TypeUtils.toFloat(speedNode.textContent) : undefined;
      }

    return new Point(lat, lng, elevation, time?.getTime(), hdop, vdop, heading, speed);
  }

  private static readWayPoint(wayPoint: Element): WayPoint | undefined {
    const pt = this.readPoint(wayPoint);
    if (!pt) return undefined;

    const nameNode = XmlUtils.getChild(wayPoint, 'name');
    const name = nameNode?.textContent ?? '';

    const descNode = XmlUtils.getChild(wayPoint, 'desc');
    const description = descNode?.textContent ?? '';

    return new WayPoint(pt, name, description);
  }

  public static exportGpx(trail: Trail, tracks: Track[]): BinaryContent {
    let gpx = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n';
    gpx += '<gpx version="1.1" creator="Trailence" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.topografix.com/GPX/1/1" xmlns:ext="https://trailence.org/schemas/gpx_extension/1" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">\n';
    gpx += '<metadata>';
      gpx += '<name>' + XmlUtils.escapeHtml(trail.name) + '</name>';
      gpx += '<desc>' + XmlUtils.escapeHtml(trail.description) + '</desc>';
    gpx += '</metadata>\n';
    for (const track of tracks) {
      gpx += '<trk>';
      for (const segment of track.segments) {
        gpx += '<trkseg>';
        for (const point of segment.points) {
          gpx += this.writePoint(point, 'trkpt');
        }
        gpx += '</trkseg>';
      }
      if (tracks.length > 1 && track.wayPoints.length > 0) {
        gpx += '<extensions>';
        for (const wp of track.wayPoints) {
          this.writePoint(wp, 'ext:wpt');
        }
        gpx += '</extensions>';
      }
      gpx += '</trk>\n';
    }
    if (tracks[tracks.length - 1].wayPoints.length > 0) {
      for (const wp of tracks[tracks.length - 1].wayPoints) {
        this.writePoint(wp, 'wpt');
      }
    }
    gpx += '</gpx>';
    const result = new BinaryContent(new TextEncoder().encode(gpx).buffer, 'application/gpx+xml');
    return result;
  }

  private static writePoint(point: Point | WayPoint, elementName: string): string {
    const pt = point instanceof Point ? point : point.point;
    const wp = point instanceof WayPoint ? point : undefined;
    let gpx = '<' + elementName;
    gpx += ' lat="' + pt.pos.lat + '" lon="' + pt.pos.lng + '">';
    if (pt.ele !== undefined) {
      gpx += '<ele>' + pt.ele + '</ele>';
    }
    if (pt.time !== undefined) {
      gpx += '<time>' + new Date(pt.time).toISOString() + '</time>';
    }
    if (wp?.name && wp.name.length > 0) {
      gpx += '<name>' + XmlUtils.escapeHtml(wp.name) + '</name>';
    }
    if (wp?.description && wp.description.length > 0) {
      gpx += '<desc>' + XmlUtils.escapeHtml(wp.description) + '</desc>';
    }
    if (pt.posAccuracy !== undefined) {
      gpx += '<hdop>' + pt.posAccuracy + '</hdop>';
    }
    if (pt.eleAccuracy !== undefined) {
      gpx += '<vdop>' + pt.eleAccuracy + '</vdop>';
    }
    if (pt.heading !== undefined || pt.speed !== undefined) {
      gpx += '<extensions>';
      if (pt.heading) {
        gpx += '<ext:heading>' + pt.heading + '</ext:heading>';
      }
      if (pt.speed) {
        gpx += '<ext:speed>' + pt.speed + '</ext:speed>';
      }
      gpx += '</extensions>';
    }
    gpx += '</' + elementName + '>';
    return gpx;
  }

}
