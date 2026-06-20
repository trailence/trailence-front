import { BehaviorSubject, EMPTY, Observable, combineLatest, map, merge, switchMap } from 'rxjs';
import { Segment, SegmentMetadata } from './segment';
import { Point } from './point';
import { PointDtoMapper } from './point-dto-mapper';
import { copyPoint, PointDescriptor } from './point-descriptor';
import { Owned } from './owned';
import { TrackDto } from './dto/track';
import { WayPoint } from './way-point';
import * as L from 'leaflet';
import { PreferencesService } from '../services/preferences/preferences.service';
import { PointReference } from './point-reference';
import { OfflineMapService } from '../services/map/offline-map.service';
import { TrackComputedData } from '../utils/track-computed-data/track-computed-data';
import { WorkerService } from '../worker/web-app';
import { TrackPointReference } from '../utils/track-computed-data/types';

export class Track extends Owned {

  private readonly _segments = new BehaviorSubject<Segment[]>([]);
  private readonly _wayPoints = new BehaviorSubject<WayPoint[]>([]);
  private readonly _meta = new TrackMetadata(this._segments);
  private readonly _computed: TrackComputedData;

  public readonly sizeUsed?: number;

  public get segments(): Segment[] { return this._segments.value; }
  public get segments$(): Observable<Segment[]> { return this._segments; }

  public get wayPoints(): WayPoint[] { return this._wayPoints.value; }
  public get wayPoints$(): Observable<WayPoint[]> { return this._wayPoints; }

  public get metadata(): TrackMetadata { return this._meta };
  public get computed(): TrackComputedData { return this._computed; }

  public get segmentChanges$(): Observable<string> {
    return this.segments$.pipe(
      switchMap(segments =>
        segments.length === 0 ? EMPTY :
        merge(...segments.map((s, index) => s.changes$.pipe(map(e => 'segment ' + index + ': ' + e))))
      ),
    );
  }

  public get waypointChanges$(): Observable<string> {
    return this.wayPoints$.pipe(
      switchMap(wayPoints =>
        wayPoints.length === 0 ? EMPTY :
        merge(...wayPoints.map((wp, index) => wp.changes$.pipe(map(e => 'way point ' + index + ': ' + e))))
      ),
    );
  }

  public get changes$(): Observable<string> {
    return merge(this.segmentChanges$, this.waypointChanges$);
  }

  constructor(
    dto: Partial<TrackDto>,
    public readonly isRecording: boolean,
    public readonly preferencesService: PreferencesService,
    public readonly mapService: OfflineMapService,
    public readonly workerService: WorkerService,
  ) {
    super(dto);
    this.sizeUsed = dto.sizeUsed;
    if (dto.s)
      for (const s of dto.s) {
        const segment = this.newSegment();
        if (s.p) {
          segment.appendMany(PointDtoMapper.toPoints(s.p));
        }
      }
    if (dto.wp)
      for (const wp of dto.wp) {
        this.appendWayPoint(new WayPoint({
          pos: {
            lat: PointDtoMapper.readCoordValue(wp.l),
            lng: PointDtoMapper.readCoordValue(wp.n),
          },
          ele: wp.e === undefined ? undefined : PointDtoMapper.readElevationValue(wp.e),
          time: wp.t,
        }, wp.na ?? '', wp.de ?? '', wp.nt, wp.dt));
      }
    this._computed = new TrackComputedData(this, preferencesService, mapService, workerService);
  }

  public newSegment(): Segment {
    const s = new Segment();
    this._segments.value.push(s);
    this._segments.next(this._segments.value);
    return s;
  }

  public insertSegment(index: number): Segment {
    const s = new Segment();
    this._segments.value.splice(index, 0, s);
    this._segments.next(this._segments.value);
    return s;
  }

  public appendWayPoint(wp: WayPoint): void {
    this._wayPoints.value.push(wp);
    this._wayPoints.next(this._wayPoints.value);
  }

  public removeWayPoint(wp: WayPoint): void {
    const index = this._wayPoints.value.indexOf(wp);
    if (index >= 0) {
      this._wayPoints.value.splice(index, 1);
      this._wayPoints.next(this._wayPoints.value);
    }
  }

  public moveWayPointAt(currentIndex: number, newIndex: number): void {
    if (currentIndex === newIndex) return;
    const nb = this._wayPoints.value.length;
    if (currentIndex < 0 || currentIndex >= nb) return;
    if (newIndex < 0 || newIndex >= nb) return;
    const wp = this._wayPoints.value.splice(currentIndex, 1)[0];
    if (newIndex === nb - 1)
      this._wayPoints.value.push(wp);
    else if (newIndex < currentIndex)
      this._wayPoints.value.splice(newIndex, 0, wp);
    else
      this._wayPoints.value.splice(newIndex - 1, 0, wp);
    this._wayPoints.next(this._wayPoints.value);
  }

  public removeEmptySegments(): void {
    let changed = false;
    for (let i = 0; i < this._segments.value.length; ++i) {
      if (this._segments.value[i].points.length < 2)  {
        this._segments.value.splice(i, 1);
        i--;
        changed = true;
      }
    }
    if (changed) this._segments.next(this._segments.value);
  }

  public removeSegmentAt(index: number): void {
    this._segments.value.splice(index, 1);
    this._segments.next(this._segments.value);
  }

  public reverse(): Track {
    return new Track({
      ...super.toDto(),
      s: this.segments.reverse().map(segment => segment.reverseDto()),
      wp: this.wayPoints.map(wp => wp.toDto()),
      sizeUsed: this.sizeUsed
    }, this.isRecording, this.preferencesService, this.mapService, this.workerService);
  }

  public override toDto(): TrackDto {
    return {
      ...super.toDto(),
      s: this.segments.map(segment => segment.toDto()),
      wp: this.wayPoints.map(wp => wp.toDto()),
      sizeUsed: this.sizeUsed
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

  public get lastSegment(): Segment {
    return this.segments.at(-1)!;
  }

  public get startDate(): number | undefined {
    for (const segment of this._segments.value) {
      const t = segment.startDate;
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

  public getAllPoints(): Point[] {
    const result: Point[] = [];
    for (const segment of this.segments) {
      for (const point of segment.points) {
        result.push(point);
      }
    }
    return result;
  }

  public forEachPoint<T>(callback: (p: Point) => T | null | undefined | void): T | undefined {
    for (const segment of this.segments) {
      for (const point of segment.points) {
        const value = callback(point);
        if (value) return value;
      }
    }
    return undefined;
  }

  public forEachPosition<T>(callback: (p: L.LatLng) => T | null | undefined | void): T | undefined {
    for (const segment of this.segments) {
      for (const point of segment.points) {
        const value = callback(point.pos);
        if (value) return value;
      }
    }
    return undefined;
  }

  public getPoint(reference: TrackPointReference): Point {
    return this.segments[reference.segmentIndex].points[reference.pointIndex];
  }

  public segmentTimeSinceDeparture(segmentIndex: number): number {
    if (segmentIndex === 0) return 0;
    let time = 0;
    for (let i = segmentIndex - 1; i >= 0; --i) {
      const sd = this.segments[i].duration;
      if (sd)
        time += sd;
    }
    return time;
  }

  public subTrack(startSegment: number, startPoint: number, endSegment: number, endPoint: number): Track {
    const sub = new Track({owner: 'nobody'}, this.isRecording, this.preferencesService, this.mapService, this.workerService);
    const newPoints: PointDescriptor[] = [];
    for (let si = startSegment; si <= endSegment; si++) {
      const s = this._segments.value[si];
      const pts = s.points;
      const endi = si === endSegment ? endPoint : pts.length - 1;
      for (let pi = si === startSegment ? startPoint : 0; pi <= endi; pi++) {
        const p = pts[pi];
        newPoints.push(copyPoint(p));
      }
    }
    const newSegment = sub.newSegment();
    newSegment.appendMany(newPoints);
    return sub;
  }

  public replace(startSegment: number, startPoint: number, endSegment: number, endPoint: number, subTrack: Track): PointReference | undefined {
    subTrack.removeEmptySegments();
    // remove
    if (startSegment === endSegment) {
      const segment = this.segments[startSegment];
      segment.removeMany(segment.points.slice(startPoint, endPoint + 1));
    } else {
      let segment = this.segments[startSegment];
      segment.removeMany(segment.points.slice(startPoint, segment.points.length));
      for (let i = startSegment + 1; i < endSegment; ++i)
        this.removeSegmentAt(startSegment + 1);
      segment = this.segments[startSegment + 1];
      segment.removeMany(segment.points.slice(0, endPoint + 1));
    }
    if (subTrack.segments.length === 0) return undefined;
    // insert
    let dstSegment = this.segments[startSegment];
    let srcSegment = subTrack.segments[0];
    if (dstSegment.points.length === startPoint) {
      dstSegment.appendMany(srcSegment.points);
    } else {
      dstSegment.insertMany(startPoint, srcSegment.points);
    }
    if (subTrack.segments.length === 1) return new PointReference(this, startSegment, startPoint + srcSegment.points.length - 1);
    let lastSegment = subTrack.segments.length - 1;
    if (endSegment > startSegment) {
      dstSegment = this.segments[startSegment + 1];
      srcSegment = subTrack.segments.at(-1)!;
      dstSegment.insertMany(0, srcSegment.points);
      if (subTrack.segments.length === 2) return new PointReference(this, startSegment + 1, srcSegment.points.length - 1);
      lastSegment--;
    }
    for (let i = 1; i <= lastSegment; ++i) {
      srcSegment = subTrack.segments[i];
      dstSegment = this.insertSegment(startSegment + 1);
      dstSegment.appendMany(srcSegment.points);
    }
    return new PointReference(this, startSegment + lastSegment + 1, srcSegment.points.length - 1);
  }

  public copy(email: string): Track {
    return new Track({
      ...this.toDto(),
      uuid: undefined,
      owner: email,
      version: undefined,
      createdAt: undefined,
      updatedAt: undefined
    }, false, this.preferencesService, this.mapService, this.workerService);
  }

  public newTrack(owner: string): Track {
    return new Track(
      {
        uuid: undefined,
        owner,
        version: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      },
      false, this.preferencesService, this.mapService, this.workerService
    );
  }

  public isEquals(other: Track): boolean {
    if (this._wayPoints.value.length != other._wayPoints.value.length) return false;
    for (let i = 0; i < this._wayPoints.value.length; ++i)
      if (!this._wayPoints.value[i].isEquals(other._wayPoints.value[i])) return false;
    if (this._segments.value.length != other._segments.value.length) return false;
    for (let i = 0; i < this._segments.value.length; ++i)
      if (!this._segments.value[i].isEquals(other._segments.value[i])) return false;
    return true;
  }

  public findPointInstance(point: Point): PointReference | undefined {
    const segments = this.segments;
    for (let i = segments.length - 1; i >= 0; --i) {
      const points = segments[i].points;
      for (let j = points.length - 1; j >= 0; --j) {
        if (points[j] === point) return new PointReference(this, i, j);
      }
    }
    return undefined;
  }

}

export class TrackMetadata {

  private readonly _distance = new BehaviorSubject<number>(0);
  private readonly _positiveElevation = new BehaviorSubject<number | undefined>(undefined);
  private readonly _negativeElevation = new BehaviorSubject<number | undefined>(undefined);
  private readonly _highestAltitude = new BehaviorSubject<number | undefined>(undefined);
  private readonly _lowestAltitude = new BehaviorSubject<number | undefined>(undefined);
  private readonly _duration = new BehaviorSubject<number | undefined>(undefined);
  private readonly _startDate = new BehaviorSubject<number | undefined>(undefined);
  private readonly _bounds = new BehaviorSubject<L.LatLngBounds | undefined>(undefined);

  constructor(
    segments$: Observable<Segment[]>
  ) {
    this.addition(segments$, meta => meta.distance$, this._distance);
    this.addition2(segments$, meta => meta.positiveElevation$, this._positiveElevation);
    this.addition2(segments$, meta => meta.negativeElevation$, this._negativeElevation);
    this.addition2(segments$, meta => meta.duration$, this._duration);
    this.highest(segments$, meta => meta.highestAltitude$, this._highestAltitude);
    this.lowest(segments$, meta => meta.lowestAltitude$, this._lowestAltitude);
    this.lowest(segments$, meta => meta.startDate$, this._startDate);
    this.reduce(segments$, meta => meta.bounds$, (a, b) => {
      if (a === undefined) return b;
      if (b === undefined) return a;
      return L.latLngBounds(L.latLng(a.getSouth(), a.getWest()), L.latLng(a.getNorth(), a.getEast())).extend(b);
    }, undefined, this._bounds);
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

  public get duration(): number | undefined { return this._duration.value; }
  public get duration$(): Observable<number | undefined> { return this._duration; }

  public get startDate(): number | undefined { return this._startDate.value; }
  public get startDate$(): Observable<number | undefined> { return this._startDate; }

  public get bounds(): L.LatLngBounds | undefined { return this._bounds.value; }
  public get bounds$(): Observable<L.LatLngBounds | undefined> { return this._bounds; }

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
