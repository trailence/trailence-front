import { Trail, TrailActivity } from '../../model/trail';
import { Track } from '../../model/track';
import { Point, PointDescriptor } from '../../model/point';
import { XmlUtils } from '../xml-utils';
import { TypeUtils } from '../type-utils';
import { WayPoint } from 'src/app/model/way-point';
import { TrailDto, TrailSourceType } from 'src/app/model/dto/trail';
import { BinaryContent } from '../binary-content';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { I18nError } from 'src/app/services/i18n/i18n-string';
import { Photo } from 'src/app/model/photo';
import { PhotoDto } from 'src/app/model/dto/photo';

export interface ImportedTrail {
  trail: Trail;
  tracks: Track[];
  tags: string[][];
  photos: Partial<PhotoDto>[];
  photosFilenames: Map<Partial<PhotoDto>, string>;
  source?: string;
}

export class GpxFormat {

  public static importGpx(file: ArrayBuffer, user: string, collectionUuid: string, preferencesService: PreferencesService, trailSourceType: TrailSourceType | undefined, trailSource: string | undefined, trailSourceDate: number | undefined): ImportedTrail { // NOSONAR
    const fileContent = new TextDecoder().decode(file);
    const parser = new DOMParser();
    const doc = parser.parseFromString(fileContent, "application/xml");
    if (doc.documentElement.nodeName.toLowerCase() !== 'gpx')
      throw new I18nError('errors.import.not_gpx');

    const trailDto = {owner: user, collectionUuid, name: '', description: '', sourceType: trailSourceType, source: trailSource, sourceDate: trailSourceDate} as TrailDto;
    const tracks: Track[] = [];
    const importedTags: string[][] = [];
    const photos: Partial<PhotoDto>[] = [];
    const photosFilenames = new Map<Partial<PhotoDto>, string>();
    let source: string | undefined;

    const metadata = XmlUtils.getChild(doc.documentElement, 'metadata');
    if (metadata) {
      const name = XmlUtils.getChildText(metadata, 'name');
      if (name && name.length > 0) trailDto.name = name;
      const desc = XmlUtils.getChildText(metadata, 'desc');
      if (desc && desc.length > 0) trailDto.description = desc;
      const extensions = XmlUtils.getChild(metadata, 'extensions');
      if (extensions) {
        const location = XmlUtils.getChildText(extensions, 'location');
        if (location && location.length > 0) trailDto.location = location;
        const activity = XmlUtils.getChildText(extensions, 'activity');
        if (activity && activity.length > 0) trailDto.activity = TypeUtils.valueToEnum(activity, TrailActivity);
        const source = XmlUtils.getChild(extensions, 'source');
        if (source) {
          const sourceType = XmlUtils.getChildText(source, 'type');
          const sourceDate = XmlUtils.getChildText(source, 'date');
          const sourceValue = XmlUtils.getChildText(source, 'value');
          if (sourceType) trailDto.sourceType = sourceType;
          if (sourceDate) {
            const date = parseInt(sourceDate);
            if (!isNaN(date)) trailDto.sourceDate = date;
          }
          if (sourceValue) trailDto.source = sourceValue;
        }
        const tags = XmlUtils.getChild(extensions, 'tags');
        if (tags) {
          for (const tag of XmlUtils.getChildren(tags, 'tag')) {
            const tagResult: string[] = [];
            for (const tagname of XmlUtils.getChildren(tag, 'tagname')) {
              const name = tagname.textContent;
              if (name && name.length > 0) {
                tagResult.push(name);
              }
            }
            if (tagResult.length > 0) {
              importedTags.push(tagResult);
            }
          }
        }
        const photosNode = XmlUtils.getChild(extensions, 'photos');
        if (photosNode) {
          for (const photoNode of XmlUtils.getChildren(photosNode, 'photo')) {
            const photo: Partial<PhotoDto> = {
              description: photoNode.textContent ?? '',
              dateTaken: TypeUtils.toInteger(photoNode.getAttribute('date')),
              latitude: TypeUtils.toFloat(photoNode.getAttribute('lat')),
              longitude: TypeUtils.toFloat(photoNode.getAttribute('lng')),
              index: TypeUtils.toInteger(photoNode.getAttribute('index')) ?? 1,
              isCover: photoNode.getAttribute('cover') === 'true',
            };
            photos.push(photo);
            photosFilenames.set(photo, photoNode.getAttribute('filename') ?? '');
          }
        }
      }
      const link = XmlUtils.getChild(metadata, 'link');
      if (link) {
        const href = link.getAttribute('href');
        if (href) {
          source = href;
        }
      }
    }

    for (const trk of XmlUtils.getChildren(doc.documentElement, 'trk')) {
      if (trailDto.name!.length === 0)
        trailDto.name = XmlUtils.getChildText(trk, 'name') ?? '';
      if (trailDto.description!.length === 0)
        trailDto.description = XmlUtils.getChildText(trk, 'desc') ?? '';

      const track = new Track({owner: user}, preferencesService);
      for (const trkseg of XmlUtils.getChildren(trk, 'trkseg')) {
        const segment = track.newSegment();
        const points: PointDescriptor[] = [];
        for (const trkpt of XmlUtils.getChildren(trkseg, 'trkpt')) {
          const pt = this.readPoint(trkpt);
          if (pt) points.push(pt);
        }
        this.fixPoints(points);
        segment.appendMany(points);
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
    for (const rte of XmlUtils.getChildren(doc.documentElement, 'rte')) {
      if (trailDto.name!.length === 0)
        trailDto.name = XmlUtils.getChildText(rte, 'name') ?? '';
      if (trailDto.description!.length === 0)
        trailDto.description = XmlUtils.getChildText(rte, 'desc') ?? '';
      const track = new Track({owner: user}, preferencesService);
      const segment = track.newSegment();
      const points: PointDescriptor[] = [];
      for (const rtept of XmlUtils.getChildren(rte, 'rtept')) {
        const pt = this.readPoint(rtept);
        if (pt) points.push(pt);
      }
      this.fixPoints(points);
      segment.appendMany(points);
      tracks.push(track);
    }

    if (tracks.length > 0 && tracks[tracks.length - 1].wayPoints.length === 0) {
      const track = tracks[tracks.length - 1];
      for (const wpt of XmlUtils.getChildren(doc.documentElement, 'wpt')) {
        const wp = this.readWayPoint(wpt);
        if (wp) track.appendWayPoint(wp);
      }
    }

    if (tracks.length === 0) throw new I18nError('errors.import.not_gpx');
    const trail = new Trail({...trailDto, originalTrackUuid: tracks[0].uuid, currentTrackUuid: tracks[tracks.length - 1].uuid});

    return { trail, tracks, tags: importedTags, photos, photosFilenames, source };
  }

  private static readPoint(point: Element): PointDescriptor | undefined {
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

    return { pos: {lat, lng}, ele: elevation, time: time?.getTime(), posAccuracy: hdop, eleAccuracy: vdop, heading, speed };
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

  private static fixPoints(points: PointDescriptor[]): void { // NOSONAR
    while (this.removeTimeGoingToPast(points));
    this.removeTimeIfAllPointsAreAtTheSameTime(points);
    this.removeImpossibleElevations(points);
  }

  private static removeTimeGoingToPast(points: PointDescriptor[]): boolean {
    if (points.length === 0) return false;
    let previousTime: number | undefined = points[0].time;
    let changed = false;
    for (let i = 1; i < points.length; ++i) {
      const time = points[i].time;
      if (time === undefined) continue;
      if (previousTime === undefined) {
        previousTime = time;
        continue;
      }
      if (time < previousTime) {
        // going to the past
        changed = true;
        const r = points.reduce((p, n) => {
          if (n.time === undefined) return p;
          const diff1 = Math.abs(previousTime! - n.time);
          const diff2 = Math.abs(time - n.time);
          if (diff1 < diff2) p.c1++; else p.c2++;
          return p;
        }, {c1: 0, c2: 0});
        if (r.c1 >= r.c2) {
          // there are more dates close to previousTime => keep previous time and remove this point's time
          points[i].time = undefined;
          continue;
        }
        // there are more dates close to this time, consider previous time as invalid
        for (let j = i - 1; j >= 0; --j) {
          if (points[j].time !== undefined && points[j].time! > time) points[j].time = undefined;
        }
      }
      previousTime = time;
    }
    return changed;
  }

  private static removeTimeIfAllPointsAreAtTheSameTime(points: PointDescriptor[]): void {
    let firstTimeIndex = points.findIndex(p => p.time !== undefined);
    if (firstTimeIndex >= 0) {
      let lastTimeIndex = points.length - 1;
      while (lastTimeIndex > firstTimeIndex && points[lastTimeIndex].time === undefined) lastTimeIndex--;
      if (lastTimeIndex > firstTimeIndex && points[firstTimeIndex].time === points[lastTimeIndex].time) {
        // all points seems to have the same date => put all to undefined
        points.forEach(p => p.time = undefined);
      }
    }
  }

  private static removeImpossibleElevations(points: PointDescriptor[]): void {
    for (const point of points) {
      if (point.ele !== undefined && (point.ele < -1000 || point.ele > 10000))
        point.ele = undefined;
    }
  }

  public static exportGpx(trail: Trail, tracks: Track[], tags: string[][], photos: Photo[], photosFilenames: Map<Photo, string>): BinaryContent { // NOSONAR
    let gpx = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n';
    gpx += '<gpx version="1.1" creator="Trailence" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.topografix.com/GPX/1/1" xmlns:ext="https://trailence.org/schemas/gpx_extension/1" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">\n';
    gpx += '<metadata>';
      gpx += '<name>' + XmlUtils.escapeHtml(trail.name) + '</name>';
      gpx += '<desc>' + XmlUtils.escapeHtml(trail.description) + '</desc>';
      if (trail.location.length > 0 || tags.length > 0 || photos.length > 0 || trail.activity?.length || trail.sourceType) {
        gpx += '<extensions>';
        if (trail.location.length > 0) {
          gpx += '<ext:location>' + XmlUtils.escapeHtml(trail.location) + '</ext:location>';
        }
        if (trail.activity?.length) {
          gpx += '<ext:activity>' + XmlUtils.escapeHtml(trail.activity) + '</ext:activity>';
        }
        if (trail.sourceType) {
          gpx += '<ext:source><type>' + XmlUtils.escapeHtml(trail.sourceType) + '</type>';
          if (trail.sourceDate) gpx += '<date>' + trail.sourceDate + '</date>';
          if (trail.source) gpx += '<value>' + XmlUtils.escapeHtml(trail.source) + '</value>';
          gpx += '</ext:source>';
        }
        if (tags.length > 0) {
          gpx += '<ext:tags>';
          for (const tag of tags) {
            gpx += '<ext:tag>';
            for (const name of tag) {
              gpx += '<ext:tagname>' + XmlUtils.escapeHtml(name) + '</ext:tagname>';
            }
            gpx += '</ext:tag>';
          }
          gpx += '</ext:tags>';
        }
        if (photos.length > 0) {
          gpx += '<ext:photos>';
          for (const photo of photos) {
            gpx += '<ext:photo';
            gpx += ' filename="' + photosFilenames.get(photo)! + '"';
            if (photo.dateTaken) gpx += ' date="' + photo.dateTaken + '"';
            if (photo.latitude !== undefined) gpx += ' lat="' + photo.latitude + '"';
            if (photo.longitude !== undefined) gpx += ' lng="' + photo.longitude + '"';
            gpx += ' index="' + photo.index + '"';
            gpx += ' cover="' + photo.isCover + '"';
            gpx += '>';
            gpx += XmlUtils.escapeHtml(photo.description);
            gpx += '</ext:photo>';
          }
          gpx += '</ext:photos>';
        }
        gpx += '</extensions>';
      }
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

  private static writePoint(point: Point | WayPoint, elementName: string): string { // NOSONAR
    const pt = point instanceof WayPoint ? point.point : point;
    const wp = point instanceof WayPoint ? point : undefined;
    let gpx = '<' + elementName;
    gpx += ' lat="' + pt.pos.lat.toFixed(7) + '" lon="' + pt.pos.lng.toFixed(7) + '">';
    if (pt.ele !== undefined) {
      gpx += '<ele>' + pt.ele.toFixed(1) + '</ele>';
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
      gpx += '<hdop>' + pt.posAccuracy.toFixed(2) + '</hdop>';
    }
    if (pt.eleAccuracy !== undefined) {
      gpx += '<vdop>' + pt.eleAccuracy.toFixed(2) + '</vdop>';
    }
    if (pt.heading !== undefined || pt.speed !== undefined) {
      gpx += '<extensions>';
      if (pt.heading) {
        gpx += '<ext:heading>' + pt.heading.toFixed(2) + '</ext:heading>';
      }
      if (pt.speed) {
        gpx += '<ext:speed>' + pt.speed.toFixed(2) + '</ext:speed>';
      }
      gpx += '</extensions>';
    }
    gpx += '</' + elementName + '>';
    return gpx;
  }

}
