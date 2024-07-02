import { BehaviorSubject, Observable, combineLatest, concat, map, of, skip, switchMap } from 'rxjs';
import { Segment, SegmentMetadata } from './segment';
import { Point, PointDtoMapper } from './point';
import { Owned } from './owned';
import { TrackDto } from './dto/track';
import { WayPoint } from './way-point';
import * as L from 'leaflet';

export class Track extends Owned {

  private _segments = new BehaviorSubject<Segment[]>([]);
  private _wayPoints = new BehaviorSubject<WayPoint[]>([]);
  private _meta = new TrackMetadata(this._segments);

  public get segments(): Segment[] { return this._segments.value; }
  public get segments$(): Observable<Segment[]> { return this._segments; }

  public get wayPoints(): WayPoint[] { return this._wayPoints.value; }
  public get wayPoints$(): Observable<WayPoint[]> { return this._wayPoints; }

  public get metadata(): TrackMetadata { return this._meta };

  public get changes$(): Observable<any> {
    return combineLatest([
      this.segments$.pipe(
        switchMap(segments => segments.length === 0 ? of([]) : concat(of([]), combineLatest(segments.map(s => s.changes$))))
      ),
      this.wayPoints$.pipe(
        switchMap(wayPoints => wayPoints.length === 0 ? of([]) : concat(of([]), combineLatest(wayPoints.map(wp => wp.changes$))))
      )
    ]).pipe(
      skip(1)
    );
  }

  constructor(
    dto: Partial<TrackDto>
  ) {
    super(dto);
    dto.s?.forEach(s => {
      const segment = this.newSegment();
      if (s.p) {
        segment.appendMany(PointDtoMapper.toPoints(s.p));
      }
    });
    dto.wp?.forEach(wp => {
      const pt = new Point(
        PointDtoMapper.readCoordValue(wp.l),
        PointDtoMapper.readCoordValue(wp.n),
        wp.e !== undefined ? PointDtoMapper.readElevationValue(wp.e) : undefined,
        wp.t
      );
      this.appendWayPoint(new WayPoint(pt, wp.na ?? '', wp.de ?? ''));
    });
  }

  public newSegment(): Segment {
    const s = new Segment();
    this._segments.value.push(s);
    this._segments.next(this._segments.value);
    return s;
  }

  public appendWayPoint(wp: WayPoint): void {
    this._wayPoints.value.push(wp);
    this._wayPoints.next(this._wayPoints.value);
  }

  public override toDto(): TrackDto {
    return {
      ...super.toDto(),
      s: this.segments.map(segment => segment.toDto()),
      wp: this.wayPoints.map(wp => wp.toDto())
    }
  }

  public get departurePoint(): Point | undefined {
    for (const segment of this._segments.value) {
      const pt = segment.departurePoint;
      if (pt) return pt;
    }
    return undefined;
  }

  public get arrivalPoint(): Point | undefined {
    for (let i = this._segments.value.length - 1; i >= 0; --i) {
      const pt = this._segments.value[i].arrivalPoint;
      if (pt) return pt;
    }
    return undefined;
  }

  public get startDate(): number | undefined {
    for (let i = 0; i < this._segments.value.length; ++i) {
      const t = this._segments.value[i].startDate;
      if (t) return t;
    }
    return undefined;
  }

  public getAllPositions(): L.LatLng[] {
    const result: L.LatLng[] = [];
    for (const segment of this.segments) {
      for (const point of segment.points) {
        result.push(point.pos);
      }
    }
    return result;
  }

  public getBounds(): L.LatLngBounds | undefined {
    let topLat: number | undefined;
    let bottomLat: number | undefined;
    let leftLng: number | undefined;
    let rightLng: number | undefined;
    for (const segment of this.segments) {
      for (const point of segment.points) {
        const pos = point.pos;
        if (topLat === undefined || pos.lat < topLat) {
          topLat = pos.lat;
        }
        if (bottomLat === undefined || pos.lat > bottomLat) {
          bottomLat = pos.lat;
        }
        if (leftLng === undefined || pos.lng < leftLng) {
          leftLng = pos.lng;
        }
        if (rightLng === undefined || pos.lng > rightLng) {
          rightLng = pos.lng;
        }
      }
    }
    if (topLat === undefined || topLat === bottomLat || leftLng === rightLng) return undefined;
    return new L.LatLngBounds([topLat!, leftLng!], [bottomLat!, rightLng!]);
  }

  public subTrack(startSegment: number, startPoint: number, endSegment: number, endPoint: number): Track {
    const sub = new Track({owner: 'nobody'});
    const newPoints: Point[] = [];
    for (let si = startSegment; si <= endSegment; si++) {
      const s = this._segments.value[si];
      const pts = s.points;
      const endi = si === endSegment ? endPoint : pts.length - 1;
      for (let pi = si === startSegment ? startPoint : 0; pi <= endi; pi++) {
        const p = pts[pi];
        newPoints.push(new Point(p.pos.lat, p.pos.lng, p.ele, p.time, p.posAccuracy, p.eleAccuracy, p.heading, p.speed));
      }
    }
    const newSegment = sub.newSegment();
    newSegment.appendMany(newPoints);
    return sub;
  }

  public copy(email: string): Track {
    return new Track({
      ...this.toDto(),
      uuid: undefined,
      owner: email,
      version: undefined,
      createdAt: undefined,
      updatedAt: undefined
    });
  }

}

export class TrackMetadata {

  private _distance = new BehaviorSubject<number>(0);
  private _positiveElevation = new BehaviorSubject<number | undefined>(undefined);
  private _negativeElevation = new BehaviorSubject<number | undefined>(undefined);
  private _highestAltitude = new BehaviorSubject<number | undefined>(undefined);
  private _lowestAltitude = new BehaviorSubject<number | undefined>(undefined);
  private _duration = new BehaviorSubject<number>(0);
  private _startDate = new BehaviorSubject<number | undefined>(undefined);

  constructor(
    segments$: Observable<Segment[]>
  ) {
    this.addition(segments$, meta => meta.distance$, this._distance);
    this.addition2(segments$, meta => meta.positiveElevation$, this._positiveElevation);
    this.addition2(segments$, meta => meta.negativeElevation$, this._negativeElevation);
    this.addition(segments$, meta => meta.duration$, this._duration);
    this.highest(segments$, meta => meta.highestAltitude$, this._highestAltitude);
    this.lowest(segments$, meta => meta.lowestAltitude$, this._lowestAltitude);
    this.lowest(segments$, meta => meta.startDate$, this._startDate);
  }

  public get distance(): number { return this._distance.value; }
  public get distance$(): Observable<number> { return this._distance; }

  public get positiveElevation(): number | undefined { return this._positiveElevation.value; }
  public get positiveElevation$(): Observable<number | undefined> { return this._positiveElevation; }

  public get negativeElevation(): number | undefined { return this._negativeElevation.value; }
  public get negativeElevation$(): Observable<number | undefined> { return this._negativeElevation; }

  public get highestAltitude(): number | undefined { return this._highestAltitude.value; }
  public get highestAltitude$(): Observable<number | undefined> { return this._highestAltitude; }

  public get lowestAltitude(): number | undefined { return this._lowestAltitude.value; }
  public get lowestAltitude$(): Observable<number | undefined> { return this._lowestAltitude; }

  public get duration(): number { return this._duration.value; }
  public get duration$(): Observable<number> { return this._duration; }

  public get startDate(): number | undefined { return this._startDate.value; }
  public get startDate$(): Observable<number | undefined> { return this._startDate; }

  private addition(segments$: Observable<Segment[]>, getter: (meta: SegmentMetadata) => Observable<number>, target: BehaviorSubject<number>): void {
    this.reduce(segments$, getter, (a,b) => a + b, 0, target);
  }

  private addition2(segments$: Observable<Segment[]>, getter: (meta: SegmentMetadata) => Observable<number | undefined>, target: BehaviorSubject<number | undefined>): void {
    this.reduce(segments$, getter, (a,b) => {
      if (a === undefined) return b;
      if (b === undefined) return a;
      return a + b;
    }, undefined, target);
  }

  private highest(segments$: Observable<Segment[]>, getter: (meta: SegmentMetadata) => Observable<number | undefined>, target: BehaviorSubject<number | undefined>): void {
    const reduce = (a: number | undefined, b: number | undefined) => {
      if (a === undefined) return b;
      if (b === undefined) return a;
      return Math.max(a, b);
    };
    this.reduce(segments$, getter, reduce, undefined, target);
  }

  private lowest(segments$: Observable<Segment[]>, getter: (meta: SegmentMetadata) => Observable<number | undefined>, target: BehaviorSubject<number | undefined>): void {
    const reduce = (a: number | undefined, b: number | undefined) => {
      if (a === undefined) return b;
      if (b === undefined) return a;
      return Math.min(a, b);
    };
    this.reduce(segments$, getter, reduce, undefined, target);
  }

  private reduce<T>(
    segments$: Observable<Segment[]>,
    getter: (meta: SegmentMetadata) => Observable<T>,
    reduce: (a: T, b: T) => T,
    initialValue: T,
    target: BehaviorSubject<T>
  ): void {
    segments$.pipe(
      switchMap(segments =>
        combineLatest(segments.map(segment => getter(segment.metadata)))
        .pipe(
          map(list => list.reduce(reduce, initialValue))
        )
      )
    ).subscribe(newValue => {
      if (newValue !== target.value) {
        target.next(newValue);
      }
    });
  }

}
