import { BehaviorSubject, Observable, map } from 'rxjs';
import { Point, PointDtoMapper } from './point';
import { Arrays } from '../utils/arrays';
import { Subscriptions } from '../utils/subscription-utils';
import { SegmentDto } from './dto/segment';

export class Segment {

  private _points = new BehaviorSubject<Point[]>([]);
  private _segmentPoints: SegmentPoint[] = [];
  private _meta = new SegmentMetadata(this._segmentPoints);

  public get points(): Point[] { return this._points.value; }
  public get points$(): Observable<Point[]> { return this._points; }

  public get metadata(): SegmentMetadata {return this._meta; }

  public append(point: Point): this {
    this._points.value.push(point)
    this._points.next(this._points.value);
    this._segmentPoints.push(new SegmentPoint(this._meta, point, Arrays.last(this._segmentPoints), undefined));
    return this;
  }

  public toDto(): SegmentDto {
    const dto: SegmentDto = {p: []};
    let previousPoint: Point | undefined = undefined;
    this.points.forEach(point => {
      const pointDto = PointDtoMapper.toDto(point, previousPoint);
      previousPoint = point;
      dto.p!.push(pointDto);
    });
    return dto;
  }

}

class SegmentPoint {

  private distanceFromPrevious = 0;
  private elevationFromPrevious = 0;
  private elevation?: number;
  private time?: number;
  private durationFromPrevious = 0;

  private subscriptions = new Subscriptions();

  constructor(
    private meta: SegmentMetadata,
    public point: Point,
    public previous?: SegmentPoint,
    public next?: SegmentPoint,
  ) {
    if (previous) previous.setNext(this);
    if (next) next.setPrevious(this);
    meta.pointAdded(this);
    this.update();
    this.subscriptions.add(this.point.lat$.subscribe(() => {
      this.updateDistance();
      this.next?.updateDistance();
    }));
    this.subscriptions.add(this.point.lng$.subscribe(() => {
      this.updateDistance();
      this.next?.updateDistance();
    }));
    this.subscriptions.add(this.point.ele$.subscribe(() => {
      this.updateElevation();
      this.next?.updateElevation();
    }));
    this.subscriptions.add(this.point.time$.subscribe(() => {
      this.updateDuration();
      this.next?.updateDuration();
    }));
  }

  close(): void {
    this.subscriptions.unsusbcribe();
  }

  private setPrevious(previous?: SegmentPoint): void {
    this.previous?.setNext();
    this.previous = previous;
    this.update();
  }

  private setNext(next?: SegmentPoint): void {
    this.next?.setPrevious();
    this.next = next;
  }

  private update(): void {
    this.updateDistance();
    this.updateElevation();
    this.updateDuration();
  }

  private updateDistance(): void {
    const newDistanceFromPrevious = this.previous ? this.point.distanceTo(this.previous.point) : 0;
    this.meta.addDistance(newDistanceFromPrevious - this.distanceFromPrevious);
    this.distanceFromPrevious = newDistanceFromPrevious;
  }

  private updateElevation(): void {
    const newElevationFromPrevious = this.previous?.point.ele !== undefined && this.point.ele !== undefined ? (this.point.ele - this.previous.point.ele) : 0;
    this.meta.addElevation(newElevationFromPrevious - this.elevationFromPrevious);
    this.elevationFromPrevious = newElevationFromPrevious;
    if (this.elevation !== this.point.ele) {
      this.elevation = this.point.ele;
      this.meta.elevationChanged(this);
    }
  }

  private updateDuration(): void {
    const newDurationFromPrevious = this.previous?.point.time !== undefined && this.point.time !== undefined ? (this.point.time - this.previous.point.time) : 0;
    this.meta.addDuration(newDurationFromPrevious - this.durationFromPrevious);
    this.durationFromPrevious = newDurationFromPrevious;
    if (this.time !== this.point.time) {
      this.time = this.point.time;
      this.meta.timeChanged(this);
    }
  }

}

export class SegmentMetadata {

  private _distance = new BehaviorSubject<number>(0);
  private _positiveElevation = new BehaviorSubject<number>(0);
  private _negativeElevation = new BehaviorSubject<number>(0);
  private _highestPoint = new BehaviorSubject<SegmentPoint | undefined>(undefined);
  private _lowestPoint = new BehaviorSubject<SegmentPoint | undefined>(undefined);
  private _duration = new BehaviorSubject<number>(0);
  private _startPoint = new BehaviorSubject<SegmentPoint | undefined>(undefined);

  constructor(
    private segmentPoints: SegmentPoint[],
  ) {}

  public get distance(): number { return this._distance.value; }
  public get distance$(): Observable<number> { return this._distance; }

  public get positiveElevation(): number { return this._positiveElevation.value; }
  public get positiveElevation$(): Observable<number> { return this._positiveElevation; }

  public get negativeElevation(): number { return this._negativeElevation.value; }
  public get negativeElevation$(): Observable<number> { return this._negativeElevation; }

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
    if (e === 0) return;
    if (e < 0) {
      this._negativeElevation.next(this._negativeElevation.value + (-e));
    } else {
      this._positiveElevation.next(this._positiveElevation.value + e);
    }
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

}
