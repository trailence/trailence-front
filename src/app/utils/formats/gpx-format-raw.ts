import { PointDescriptor } from '../../model/point-descriptor';
import { XmlUtils } from '../xml-utils';
import { TypeUtils } from '../type-utils';
import { WayPoint } from '../../model/way-point';
import { TrailDto, TrailSourceType } from '../../model/dto/trail';
import { I18nError } from '../../services/i18n/i18n-string';
import { PhotoDto } from '../../model/dto/photo';
import { TrailActivity } from '../../model/dto/trail-activity';

export interface ImportedTrackRaw {
  segments: PointDescriptor[][];
  wayPoints: WayPoint[];
}

export interface ImportedTrailRaw {
  trail: TrailDto;
  tracks: ImportedTrackRaw[];
  tags: string[][];
  photos: Partial<PhotoDto>[];
  photosFilenames: Map<Partial<PhotoDto>, string>;
  source?: string;
}

export class GpxFormatRaw {

  public static importGpxRaw(file: ArrayBuffer, user: string, collectionUuid: string, trailSourceType: TrailSourceType | undefined, trailSource: string | undefined, trailSourceDate: number | undefined, parser: DOMParser): ImportedTrailRaw { // NOSONAR
    const fileContent = new TextDecoder().decode(file);
    const doc = parser.parseFromString(fileContent, "application/xml");
    if (doc.documentElement.nodeName.toLowerCase() !== 'gpx')
      throw new I18nError('errors.import.not_gpx');

    const trailDto = {owner: user, collectionUuid, name: '', description: '', sourceType: trailSourceType, source: trailSource, sourceDate: trailSourceDate} as TrailDto;
    const tracks: ImportedTrackRaw[] = [];
    const importedTags: string[][] = [];
    const photos: Partial<PhotoDto>[] = [];
    const photosFilenames = new Map<Partial<PhotoDto>, string>();
    let source: string | undefined;

    const metadata = XmlUtils.getChild(doc.documentElement, 'metadata');
    if (metadata) {
      let name = XmlUtils.getChildText(metadata, 'name');
      if (name && name.length > 0) {
        // visorando gpx is wrong, and may encode &amp;#xxx
        if (name.includes('&#')) {
          try {
            const div = document.createElement('DIV');
            div.innerHTML = name;
            const newName = div.childNodes.length > 0 ? div.childNodes[0].nodeValue : undefined;
            if (newName && newName.length > 0) name = newName;
          } catch (e) { /* ignore */} // NOSONAR
        }
        trailDto.name = name;
      }
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
            const date = Number.parseInt(sourceDate);
            if (!Number.isNaN(date)) trailDto.sourceDate = date;
          }
          if (sourceValue) trailDto.source = sourceValue;
        }
        const followed_trail = XmlUtils.getChild(extensions, 'followed_trail');
        if (followed_trail) {
          const owner = XmlUtils.getChildText(followed_trail, 'owner');
          const uuid = XmlUtils.getChildText(followed_trail, 'uuid');
          trailDto.followedOwner = owner;
          trailDto.followedUuid = uuid;
        }
        const followed_url = XmlUtils.getChild(extensions, 'followed_url');
        if (followed_url)
          trailDto.followedUrl = followed_url.textContent ?? undefined;
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

      const track: ImportedTrackRaw = {segments: [], wayPoints: []};
      for (const trkseg of XmlUtils.getChildren(trk, 'trkseg')) {
        const segment: PointDescriptor[] = [];
        track.segments.push(segment);
        for (const trkpt of XmlUtils.getChildren(trkseg, 'trkpt')) {
          const pt = this.readPoint(trkpt);
          if (pt) segment.push(pt);
        }
        this.fixPoints(segment);
      }
      const extensions = XmlUtils.getChild(trk, 'extensions');
      if (extensions) {
        for (const wpt of XmlUtils.getChildren(extensions, 'wpt')) {
          const wp = this.readWayPoint(wpt);
          if (wp) track.wayPoints.push(wp);
        }
      }
      tracks.push(track);
    }
    for (const rte of XmlUtils.getChildren(doc.documentElement, 'rte')) {
      if (trailDto.name!.length === 0)
        trailDto.name = XmlUtils.getChildText(rte, 'name') ?? '';
      if (trailDto.description!.length === 0)
        trailDto.description = XmlUtils.getChildText(rte, 'desc') ?? '';
      const track: ImportedTrackRaw = {segments: [], wayPoints: []};
      const segment: PointDescriptor[] = [];
      track.segments.push(segment);
      for (const rtept of XmlUtils.getChildren(rte, 'rtept')) {
        const pt = this.readPoint(rtept);
        if (pt) segment.push(pt);
      }
      this.fixPoints(segment);
      tracks.push(track);
    }

    if (tracks.length > 0 && tracks.at(-1)!.wayPoints.length === 0) {
      const track = tracks.at(-1)!;
      for (const wpt of XmlUtils.getChildren(doc.documentElement, 'wpt')) {
        const wp = this.readWayPoint(wpt);
        if (wp) track.wayPoints.push(wp);
      }
    }

    if (tracks.length === 0) throw new I18nError('errors.import.not_gpx');
    return { trail: trailDto, tracks, tags: importedTags, photos, photosFilenames, source };
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

  private static fixPoints(points: PointDescriptor[]): void {
    while (this.removeTimeGoingToPast(points));
    this.removeTimeIfAllPointsAreAtTheSameTime(points);
    this.removeImpossibleElevations(points);
  }

  private static removeTimeGoingToPast(points: PointDescriptor[]): boolean { // NOSONAR
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
        for (const p of points) p.time = undefined;
      }
    }
  }

  private static removeImpossibleElevations(points: PointDescriptor[]): void {
    for (const point of points) {
      if (point.ele !== undefined && (point.ele < -1000 || point.ele > 10000))
        point.ele = undefined;
    }
  }

}
