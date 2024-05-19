import { Point } from '../point';
import { Segment } from '../segment';
import { Track } from '../track';

export class TrackDto {

  public id: string;
  public version: number;
  public updated: boolean;
  public s: SegmentDto[];

  constructor(
    fields?: Partial<TrackDto>
  ) {
    this.id = fields?.id ?? '';
    this.version = fields?.version ?? 0;
    this.updated = fields?.updated ?? false;
    this.s = fields?.s ? fields.s.map(segment => new SegmentDto(segment)) : []
  }

  public toTrack(track: Track): void {
    track.id = this.id;
    track.version = this.version;
    this.s.map(segmentDto => {
      const segment = track.newSegment();
      segmentDto.toSegment(segment);
    });
    track.updated = this.updated;
  }

  public static of(track: Track): TrackDto {
    const dto = new TrackDto({id: track.id, version: track.version, updated: track.updated});
    dto.s = track.segments.map(SegmentDto.of);
    return dto;
  }

}

export class SegmentDto {

  public p: PointDto[];

  constructor(
    fields?: Partial<SegmentDto>
  ) {
    this.p = fields?.p ? fields.p.map(point => new PointDto(point)) : [];
  }

  public toSegment(segment: Segment): void {
    let previousPoint: Point | undefined = undefined;
    this.p.forEach(pointDto => {
      const nextPoint = pointDto.toPoint(previousPoint);
      previousPoint = nextPoint;
      segment.append(nextPoint);
    });
  }

  public static of(segment: Segment): SegmentDto {
    const dto = new SegmentDto();
    let previousPoint: Point | undefined = undefined;
    segment.points.forEach(point => {
      const pointDto = PointDto.of(point, previousPoint);
      previousPoint = point;
      dto.p.push(pointDto);
    });
    return dto;
  }

}

export class PointDto {

  public l?: number;
  public n?: number;
  public e?: number | null;
  public t?: number | null;

  constructor(
    fields?: Partial<PointDto>
  ) {
    this.l = fields?.l;
    this.n = fields?.n;
    this.e = fields?.e;
    this.t = fields?.t;
  }

  public toPoint(previous?: Point): Point {
    return new Point(
      this.toCoord(this.l, previous?.lat),
      this.toCoord(this.n, previous?.lng),
      this.toValue(this.e, previous?.ele),
      this.toValue(this.t, previous?.time)
    );
  }

  private toCoord(value: number | undefined, previous: number | undefined): number {
    if (value === undefined) return previous!;
    if (previous === undefined) return parseFloat((value / 1000000).toFixed(6));
    return previous + parseFloat((value / 1000000).toFixed(6));
  }

  private toValue(value: number | null | undefined, previous: number | undefined): number | undefined {
    if (value === null) return undefined;
    if (value === undefined) return previous;
    if (previous === undefined) return value;
    return previous + value;
  }

  public static of(point: Point, previous?: Point): PointDto {
    if (!previous) return new PointDto({l: Math.floor(point.lat * 1000000), n: Math.floor(point.lng * 1000000), e: point.ele, t: point.time});
    const dto = new PointDto();
    if (point.lat !== previous.lat) dto.l = this.diffCoord(point.lat, previous.lat);
    if (point.lng !== previous.lng) dto.n = this.diffCoord(point.lng, previous.lng);
    if (point.ele !== previous.ele) dto.e = this.diff(point.ele, previous.ele);
    if (point.time !== previous.time) dto.t = this.diff(point.time, previous.time);
    return dto;
  }

  private static diffCoord(newValue: number, previousValue: number | undefined): number | undefined {
    if (previousValue === undefined) return Math.floor(newValue * 1000000);
    return Math.floor(newValue * 1000000) - Math.floor(previousValue * 1000000);
  }

  private static diff(newValue: number | undefined, previousValue: number | undefined): number | null | undefined {
    if (newValue === undefined) return null;
    if (previousValue === undefined) return newValue;
    return newValue - previousValue;
  }


}
