import { BehaviorSubject, Observable, combineLatest, concat, map, of, skip, switchMap, tap } from 'rxjs';
import { Point, PointDtoMapper } from './point';
import { Arrays } from '../utils/arrays';
import { Subscriptions } from '../utils/rxjs/subscription-utils';
import { SegmentDto } from './dto/segment';

export class Segment {

  private _points = new BehaviorSubject<Point[]>([]);
  private _segmentPoints: SegmentPoint[] = [];
  private _meta = new SegmentMetadata(this._segmentPoints);

  public get points(): Point[] { return this._points.value; }
  public get points$(): Observable<Point[]> { return this._points; }

  public get metadata(): SegmentMetadata {return this._meta; }

  public get relativePoints(): SegmentPoint[] { return this._segmentPoints; }

  public get changes$(): Observable<any> {
    return this.points$.pipe(
      switchMap(points => points.length === 0 ? of([]) : combineLatest(points.map(point => concat(of(true), point.changes$)))),
      skip(1)
    )
  }

  public append(point: Point): this {
    this._points.value.push(point)
    this._segmentPoints.push(new SegmentPoint(this._meta, point, Arrays.last(this._segmentPoints), undefined));
    this._points.next(this._points.value);
    return this;
  }

  public appendMany(points: Point[]): this {
    this._points.value.push(...points)
    let previous = Arrays.last(this._segmentPoints);
    const nb = points.length;
    const newPoints: SegmentPoint[] = new Array(nb);
    for (let i = 0; i < nb; ++i) {
      const sp = new SegmentPoint(undefined, points[i], previous, undefined);
      previous = sp;
      newPoints[i] = sp;
    }
    this._meta.computeNewPoints(newPoints);
    for (let i = 0; i < nb; ++i) newPoints[i].setMeta(this._meta);
    this._segmentPoints.push(...newPoints);
    this._points.next(this._points.value);
    return this;
  }

  public toDto(): SegmentDto {
    const nb = this.points.length;
    const dto: SegmentDto = {p: new Array(nb)};
    let previousPoint: Point | undefined = undefined;
    for (let i = 0; i < nb; ++i) {
      const pointDto = PointDtoMapper.toDto(this.points[i], previousPoint);
      previousPoint = this.points[i];
      dto.p![i] = pointDto;
    }
    return dto;
  }

  public get departurePoint(): Point | undefined {
    if (this._points.value.length === 0) return undefined;
    return this._points.value[0];
  }

  public get arrivalPoint(): Point | undefined {
    if (this._points.value.length === 0) return undefined;
    return this._points.value[this._points.value.length - 1];
  }

  public get startDate(): number | undefined {
    if (this._points.value.length === 0) return undefined;
    for (const point of this._points.value) {
      if (point.time) return point.time;
    }
    return undefined;
  }

}

export class SegmentPoint {

  private distanceFromPrevious = 0;
  private elevationFromPrevious?: number;
  private elevation?: number;
  private time?: number;
  private durationFromPrevious = 0;

  private subscriptions = new Subscriptions();

  constructor(
    private meta: SegmentMetadata | undefined,
    private _point: Point,
    private _previous?: SegmentPoint,
    private _next?: SegmentPoint,
  ) {
    if (_previous) _previous.setNext(this);
    if (_next) _next.setPrevious(this);
    meta?.pointAdded(this);
    let init = false;
    this.subscriptions.add(_point.pos$.subscribe(() => {
      if (!init) return;
      this.updateDistance();
      this._next?.updateDistance();
    }));
    this.subscriptions.add(_point.ele$.subscribe(() => {
      if (!init) return;
      this.updateElevation();
      this._next?.updateElevation();
    }));
    this.subscriptions.add(_point.time$.subscribe(() => {
      if (!init) return;
      this.updateDuration();
      this._next?.updateDuration();
    }));
    this.update(true);
    init = true;
  }

  public get point(): Point {return this._point; }

  public get distanceFromPreviousPoint(): number { return this.distanceFromPrevious; }
  public get durationFromPreviousPoint(): number { return this.durationFromPrevious; }
  public get elevationFromPreviousPoint(): number | undefined { return this.elevationFromPrevious; }

  close(): void {
    this.subscriptions.unsusbcribe();
  }

  private setPrevious(previous?: SegmentPoint): void {
    this._previous?.setNext();
    this._previous = previous;
    this.update();
  }

  private setNext(next?: SegmentPoint): void {
    this._next?.setPrevious();
    this._next = next;
  }

  private update(init: boolean = false): void {
    this.updateDistance(init);
    this.updateElevation(init);
    this.updateDuration(init);
  }

  private updateDistance(init: boolean = false): void {
    const newDistanceFromPrevious = this._previous ? this._point.pos.distanceTo(this._previous._point.pos) : 0;
    this.meta?.addDistance(newDistanceFromPrevious - this.distanceFromPrevious);
    this.distanceFromPrevious = newDistanceFromPrevious;
  }

  private updateElevation(init: boolean = false): void {
    const newElevationFromPrevious = this._previous?._point.ele !== undefined && this._point.ele !== undefined ? (this._point.ele - this._previous._point.ele) : undefined;
    if (newElevationFromPrevious)
      this.meta?.addElevation(this.elevationFromPrevious !== undefined ? newElevationFromPrevious - this.elevationFromPrevious : newElevationFromPrevious);
    this.elevationFromPrevious = newElevationFromPrevious;
    if (!init && this.elevation !== this._point.ele) {
      this.elevation = this._point.ele;
      this.meta?.elevationChanged(this);
    }
  }

  private updateDuration(init: boolean = false): void {
    const newDurationFromPrevious = this._previous?._point.time !== undefined && this._point.time !== undefined ? (this._point.time - this._previous._point.time) : 0;
    this.meta?.addDuration(newDurationFromPrevious - this.durationFromPrevious);
    this.durationFromPrevious = newDurationFromPrevious;
    if (!init && this.time !== this._point.time) {
      this.time = this._point.time;
      this.meta?.timeChanged(this);
    }
  }

  setMeta(meta: SegmentMetadata) {
    this.meta = meta;
  }

}

export class SegmentMetadata {

  private _distance = new BehaviorSubject<number>(0);
  private _positiveElevation = new BehaviorSubject<number | undefined>(undefined);
  private _negativeElevation = new BehaviorSubject<number | undefined>(undefined);
  private _highestPoint = new BehaviorSubject<SegmentPoint | undefined>(undefined);
  private _lowestPoint = new BehaviorSubject<SegmentPoint | undefined>(undefined);
  private _duration = new BehaviorSubject<number>(0);
  private _startPoint = new BehaviorSubject<SegmentPoint | undefined>(undefined);

  constructor(
    private segmentPoints: SegmentPoint[],
  ) {}

  public get distance(): number { return this._distance.value; }
  public get distance$(): Observable<number> { return this._distance; }

  public get positiveElevation(): number | undefined { return this._positiveElevation.value; }
  public get positiveElevation$(): Observable<number | undefined> { return this._positiveElevation; }

  public get negativeElevation(): number | undefined { return this._negativeElevation.value; }
  public get negativeElevation$(): Observable<number | undefined> { return this._negativeElevation; }

  public get highestAltitude(): number | undefined { return this._highestPoint.value?.point.ele; }
  public get highestAltitude$(): Observable<number | undefined> { return this._highestPoint.pipe(map(pt => pt?.point.ele)); }

  public get lowestAltitude(): number | undefined { return this._lowestPoint.value?.point.ele; }
  public get lowestAltitude$(): Observable<number | undefined> { return this._lowestPoint.pipe(map(pt => pt?.point.ele)); }

  public get duration(): number { return this._duration.value; }
  public get duration$(): Observable<number> { return this._duration; }

  public get startDate(): number | undefined { return this._startPoint.value?.point.time; }
  public get startDate$(): Observable<number | undefined> { return this._startPoint.pipe(map(pt => pt?.point.time)); }

  addDistance(d: number): void {
    if (d === 0) return;
    this._distance.next(this._distance.value + d);
  }

  addElevation(e: number): void {
    const addN = e <= 0 ? -e : 0;
    const addP = e >= 0 ? e : 0;
    if (this._negativeElevation.value === undefined)
      this._negativeElevation.next(addN);
    else if (addN > 0)
      this._negativeElevation.next(this._negativeElevation.value + addN);
    if (this._positiveElevation.value === undefined)
      this._positiveElevation.next(addP);
    else if (addP > 0)
      this._positiveElevation.next(this._positiveElevation.value + addP);
  }

  addDuration(d: number): void {
    if (d === 0) return;
    this._duration.next(this._duration.value + d);
  }

  pointAdded(point: SegmentPoint): void {
    if (point.point.time !== undefined) {
      if (this._startPoint.value === undefined || this._startPoint.value.point.time! > point.point.time) {
        this._startPoint.next(point);
      }
    }
    if (point.point.ele !== undefined) {
      if (this._highestPoint.value === undefined || this._highestPoint.value.point.ele! < point.point.ele) {
        this._highestPoint.next(point);
      }
      if (this._lowestPoint.value === undefined || this._lowestPoint.value.point.ele! > point.point.ele) {
        this._lowestPoint.next(point);
      }
    }
  }

  elevationChanged(point: SegmentPoint): void {
    if (this._highestPoint.value === point || this._lowestPoint.value === point ||
      (point.point.ele !== undefined &&
        (this._highestPoint.value === undefined ||
        this._lowestPoint.value === undefined ||
        this._highestPoint.value.point.ele! < point.point.ele ||
        this._lowestPoint.value.point.ele! > point.point.ele))) {
          this.computeHighestAndLowest();
      }
  }

  timeChanged(point: SegmentPoint): void {
    if (this._startPoint.value === point || (point.point.time !== undefined && (this._startPoint.value === undefined || this._startPoint.value.point.time! > point.point.time)))
      this._startPoint.next(point);
  }

  private computeHighestAndLowest(): void {
    let highest: SegmentPoint | undefined = undefined;
    let lowest: SegmentPoint | undefined = undefined;
    this.segmentPoints.forEach(pt => {
      if (pt.point.ele !== undefined) {
        if (highest === undefined) {
          highest = lowest = pt;
        } else if (highest.point.ele! < pt.point.ele) {
          highest = pt;
        } else if (lowest!.point.ele! > pt.point.ele) {
          lowest = pt;
        }
      }
    });
    if (this._highestPoint.value !== highest) this._highestPoint.next(highest);
    if (this._lowestPoint.value !== lowest) this._lowestPoint.next(lowest);
  }

  computeNewPoints(points: SegmentPoint[]): void {
    let distance = 0;
    let duration = 0;
    let positiveElevation: number | undefined = undefined;
    let negativeElevation: number | undefined = undefined;
    let startPoint = this._startPoint.value;
    points.forEach(pt => {
      distance += pt.distanceFromPreviousPoint;
      duration += pt.durationFromPreviousPoint;
      if (pt.elevationFromPreviousPoint !== undefined) {
        if (pt.elevationFromPreviousPoint > 0)
          positiveElevation = positiveElevation ? positiveElevation + pt.elevationFromPreviousPoint : pt.elevationFromPreviousPoint;
        else
          negativeElevation = negativeElevation ? negativeElevation - pt.elevationFromPreviousPoint : -pt.elevationFromPreviousPoint;
      }
      if (pt.point.time !== undefined) {
        if (startPoint === undefined || startPoint.point.time! > pt.point.time) {
          startPoint = pt;
        }
      }
    });
    this.addDistance(distance);
    this.addDuration(duration);
    if (positiveElevation !== undefined && (this._positiveElevation.value === undefined || positiveElevation > 0))
      this._positiveElevation.next((this._positiveElevation.value || 0) + positiveElevation);
    if (negativeElevation !== undefined && (this._negativeElevation.value === undefined || negativeElevation > 0))
      this._negativeElevation.next((this._negativeElevation.value || 0) + negativeElevation);
    if (this._startPoint.value !== startPoint) this._startPoint.next(startPoint);
    this.computeHighestAndLowest();
  }

}
