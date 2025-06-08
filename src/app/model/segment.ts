import { BehaviorSubject, Observable, Subject, concat, map, of, switchMap } from 'rxjs';
import { Point, PointDescriptor, PointDtoMapper, pointsAreEqual } from './point';
import { Arrays } from '../utils/arrays';
import { SegmentDto } from './dto/segment';
import * as L from 'leaflet';
import { Track } from './track';
import { TrackUtils } from '../utils/track-utils';

export class Segment {

  private readonly _points = new BehaviorSubject<PointImpl[]>([]);
  private readonly _meta = new SegmentMetadata(this._points.value);
  private readonly _pointsChanges$ = new Subject<any>();

  public get points(): Point[] { return this._points.value; }
  public get points$(): Observable<Point[]> { return this._points; }

  public get metadata(): SegmentMetadata {return this._meta; }

  public get changes$(): Observable<any> {
    let first = true;
    return this._points.pipe(
      switchMap(() => {
        if (first) {
          first = false;
          return this._pointsChanges$;
        }
        return concat(of(true), this._pointsChanges$);
      }),
    );
  }

  public append(point: PointDescriptor): Point {
    const p = new PointImpl(this._meta, point, Arrays.last(this._points.value), undefined, this._pointsChanges$);
    this._points.value.push(p);
    this._points.next(this._points.value);
    return p;
  }

  public appendMany(points: PointDescriptor[]): Point[] {
    let previous = Arrays.last(this._points.value);
    const nb = points.length;
    const newPoints: PointImpl[] = new Array(nb);
    for (let i = 0; i < nb; ++i) {
      const sp = new PointImpl(undefined, points[i], previous, undefined, this._pointsChanges$);
      previous = sp;
      newPoints[i] = sp;
    }
    this._meta.computeNewPoints(newPoints);
    for (let i = 0; i < nb; ++i) newPoints[i].setMeta(this._meta);
    this._points.value.push(...newPoints);
    this._points.next(this._points.value);
    return newPoints;
  }

  public insert(index: number, point: PointDescriptor): Point {
    if (index < 0 || index >= this._points.value.length) return this.append(point);
    const prev = index > 0 ? this._points.value[index - 1] : undefined;
    const next = this._points.value[index];
    const p = new PointImpl(this._meta, point, prev, next, this._pointsChanges$);
    this._points.value.splice(index, 0, p);
    this._points.next(this._points.value);
    return p;
  }

  public insertMany(index: number, points: PointDescriptor[]): Point[] {
    if (index < 0 || index >= this._points.value.length) return this.appendMany(points);
    let prev = index > 0 ? this._points.value[index - 1] : undefined;
    const next = this._points.value[index];
    let inserted: Point[] = [];
    for (let i = 0; i < points.length - 1; ++i) {
      const p = new PointImpl(this._meta, points[i], prev, undefined, this._pointsChanges$);
      this._points.value.splice(index + i, 0, p);
      prev = p;
      inserted.push(p);
    }
    const p = new PointImpl(this._meta, points[points.length - 1], prev, next, this._pointsChanges$);
    this._points.value.splice(index + points.length - 1, 0, p);
    this._points.next(this._points.value);
    inserted.push(p);
    return inserted;
  }

  public removePoint(point: Point): this {
    const index = this._points.value.indexOf(point as PointImpl);
    if (index < 0) return this;
    return this.removePointAt(index);
  }

  public removePointAt(index: number): this {
    const sp = this._points.value.splice(index, 1)[0];
    sp.removed();
    this._points.next(this._points.value);
    return this;
  }

  public removeMany(points: Point[]): this {
    for (const point of points) {
      this.removePoint(point);
    }
    return this;
  }

  public reverseDto(): SegmentDto {
    const nb = this.points.length;
    const dto: SegmentDto = {p: new Array(nb)};
    let previousPoint: Point | undefined = undefined;
    for (let i = 0; i < nb; ++i) {
      const pointDto = PointDtoMapper.toDto(this.points[nb - i - 1], previousPoint);
      pointDto.t = undefined;
      pointDto.h = undefined;
      pointDto.s = undefined;
      previousPoint = this.points[nb - i - 1];
      dto.p![i] = pointDto;
    }
    return dto;
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

  public get endDate(): number | undefined {
    if (this._points.value.length === 0) return undefined;
    const points = this.points;
    const nb = this.points.length;
    for (let i = nb - 1; i >= 0; --i)
      if (points[i].time) return points[i].time;
    return undefined;
  }

  public timeSinceSegmentStart(time: number | undefined): number | undefined {
    if (!time) return undefined;
    const start = this.startDate;
    if (!start) return undefined;
    if (time < start) return undefined;
    return time - start;
  }

  public get duration(): number | undefined {
    const start = this.startDate;
    if (!start) return undefined;
    const end = this.endDate;
    return end! - start;
  }

  public nearestPoint(position: L.LatLngLiteral, predicate: (point: Point) => boolean = () => true): Point | undefined {
    let nearest: Point | undefined = undefined;
    let nearestDistance: number | undefined;
    for (const point of this.points) {
      if (!predicate(point)) continue;
      if (!nearest) {
        nearest = point;
        nearestDistance = point.distanceTo(position);
      } else {
        const distance = point.distanceTo(position);
        if (distance < nearestDistance!) {
          nearest = point;
          nearestDistance = point.distanceTo(position);
        }
      }
    }
    return nearest;
  }

  public distanceFromSegmentStart(pointIndex: number): number {
    if (pointIndex === 0) return 0;
    let p: Point | undefined = this._points.value[pointIndex];
    let total = 0;
    do {
      total += p.distanceFromPreviousPoint;
      p = p.previousPoint;
    } while (p);
    return total;
  }

  public distanceBetween(startPoint: number, endPoint: number): number {
    if (endPoint === startPoint) return 0;
    let total = 0;
    let p = this._points.value[endPoint];
    let end = this._points.value[startPoint];
    while (p !== end) {
      total += p.distanceFromPreviousPoint;
      p = p.previousPoint as PointImpl;
    }
    return total;
  }

  public distanceToSegmentEnd(pointIndex: number): number {
    if (pointIndex >= this._points.value.length - 1) return 0;
    let total = 0;
    let p = this._points.value[this._points.value.length - 1];
    let end = this._points.value[pointIndex];
    while (p !== end) {
      total += p.distanceFromPreviousPoint;
      p = p.previousPoint as PointImpl;
    }
    return total;
  }

  public computeTotalDistance(): number {
    if (this._points.value.length < 2) return 0;
    return this.distanceFromSegmentStart(this._points.value.length - 1);
  }

  public isEquals(other: Segment): boolean {
    if (this._points.value.length !== other._points.value.length) return false;
    for (let i = 0; i < this._points.value.length; ++i) {
      if (!pointsAreEqual(this._points.value[i], other._points.value[i])) {
        return false;
      }
    }
    return true;
  }

}

export class PointImpl implements Point {

  private _pos: L.LatLng;
  private _ele?: number;
  private _time?: number;
  private _posAccuracy?: number;
  private _eleAccuracy?: number;
  private _heading?: number;
  private _speed?: number;

  private _distanceFromPrevious = 0;
  private _elevationFromPrevious?: number;
  private _currentElevation?: number;
  private _currentTime?: number;
  private _durationFromPrevious?: number;

  constructor(
    private meta: SegmentMetadata | undefined,
    descriptor: PointDescriptor,
    private _previous: PointImpl | undefined,
    private _next: PointImpl | undefined,
    private readonly _changes$: Subject<any>,
  ) {
    this._pos = L.latLng(descriptor.pos.lat, descriptor.pos.lng);
    this._ele = descriptor.ele;
    this._time = descriptor.time;
    this._posAccuracy = descriptor.posAccuracy;
    this._eleAccuracy = descriptor.eleAccuracy;
    this._heading = descriptor.heading;
    this._speed = descriptor.speed;
    if (_previous) _previous.setNext(this);
    if (_next) _next.setPrevious(this);
    meta?.pointAdded(this);
    this.update(true);
  }

  public get pos(): L.LatLng { return this._pos; }
  public set pos(value: L.LatLng) {
    if (this._pos.lat === value.lat && this._pos.lng === value.lng) return;
    this._pos = value;
    this.updateDistance();
    this._next?.updateDistance();
    this.meta?.positionChanged(this);
    this._changes$.next(true);
  }

  public get ele(): number | undefined { return this._ele; }
  public set ele(value: number | undefined) {
    if (this._ele === value) return;
    this._ele = value;
    this.updateElevation();
    this._next?.updateElevation();
    this._changes$.next(true);
  }

  public get time(): number | undefined { return this._time; }
  public set time(value: number | undefined) {
    if (this._time === value) return;
    this._time = value;
    this.updateDuration();
    this._next?.updateDuration();
    this._changes$.next(true);
  }

  public get posAccuracy(): number | undefined { return this._posAccuracy; }
  public set posAccuracy(value: number | undefined) {
    if (this._posAccuracy === value) return;
    this._posAccuracy = value;
    this._changes$.next(true);
  }

  public get eleAccuracy(): number | undefined { return this._eleAccuracy; }
  public set eleAccuracy(value: number | undefined) {
    if (this._eleAccuracy === value) return;
    this._eleAccuracy = value;
    this._changes$.next(true);
  }

  public get heading(): number | undefined { return this._heading; }
  public set heading(value: number | undefined) {
    if (this._heading === value) return;
    this._heading = value;
    this._changes$.next(true);
  }

  public get speed(): number | undefined { return this._speed; }
  public set speed(value: number | undefined) {
    if (this._speed === value) return;
    this._speed = value;
    this._changes$.next(true);
  }

  public get distanceFromPreviousPoint(): number { return this._distanceFromPrevious; }
  public get durationFromPreviousPoint(): number | undefined { return this._durationFromPrevious; }
  public get elevationFromPreviousPoint(): number | undefined { return this._elevationFromPrevious; }

  public get previousPoint(): Point | undefined { return this._previous; }
  public get nextPoint(): Point | undefined { return this._next; }

  private setPrevious(previous?: PointImpl): void {
    const p = this._previous;
    this._previous = undefined;
    p?.setNext();
    this._previous = previous;
    this.update();
  }

  private setNext(next?: PointImpl): void {
    const n = this._next;
    this._next = undefined;
    n?.setPrevious();
    this._next = next;
  }

  private update(init: boolean = false): void {
    this.updateDistance(init);
    this.updateElevation(init);
    this.updateDuration(init);
  }

  private updateDistance(init: boolean = false): void {
    const newDistanceFromPrevious = this._previous ? this._pos.distanceTo(this._previous._pos) : 0;
    this.meta?.addDistance(newDistanceFromPrevious - this._distanceFromPrevious);
    this._distanceFromPrevious = newDistanceFromPrevious;
  }

  private updateElevation(init: boolean = false): void {
    let p = this._previous;
    while (p && p._ele === undefined) p = p._previous;
    const previousEle = p?._ele;
    const pointEle = this._ele;
    const newElevationFromPrevious = previousEle !== undefined && pointEle !== undefined ? (pointEle - previousEle) : undefined;
    if (newElevationFromPrevious !== undefined) {
      if (this._elevationFromPrevious !== undefined)
        this.meta?.cancelElevation(this._elevationFromPrevious);
      this.meta?.addElevation(newElevationFromPrevious);
    }
    this._elevationFromPrevious = newElevationFromPrevious;
    if (!init && this._currentElevation !== pointEle) {
      this._currentElevation = pointEle;
      this.meta?.elevationChanged(this);
    }
  }

  private updateDuration(init: boolean = false): void {
    let p = this._previous;
    while (p && !p._time) p = p._previous;
    const newDurationFromPrevious = p && this._time !== undefined ? (this._time - p._time!) : undefined;
    if (newDurationFromPrevious !== undefined)
      this.meta?.addDuration(newDurationFromPrevious - (this._durationFromPrevious ?? 0));
    this._durationFromPrevious = newDurationFromPrevious;
    if (!init && this._currentTime !== this._time) {
      this._currentTime = this._time;
      this.meta?.timeChanged(this);
    }
  }

  setMeta(meta: SegmentMetadata): void {
    this.meta = meta;
  }

  removed(): void {
    if (this._previous)
      this._previous._next = this._next;
    if (this._elevationFromPrevious)
      this.meta?.cancelElevation(this._elevationFromPrevious);
    if (this._distanceFromPrevious)
      this.meta?.addDistance(-this._distanceFromPrevious);
    if (this._durationFromPrevious)
      this.meta?.addDuration(-this._durationFromPrevious);
    if (this._next) {
      this._next._previous = this._previous;
      this._next.update();
    }
  }

  public distanceTo(other: L.LatLngExpression): number {
    return L.CRS.Earth.distance(this._pos, other);
  }

  public durationFromStart(track: Track): number {
    return TrackUtils.durationBetween(track.departurePoint!, this);
  }

  public distanceFromStart(track: Track): number {
    let segmentIndex: number | undefined = undefined;
    let pointIndex: number | undefined = undefined;
    for (let si = 0; si < track.segments.length; ++si) {
      const segment = track.segments[si];
      for (let pi = 0; pi < segment.points.length; ++pi) {
        if (segment.points[pi] === this) {
          segmentIndex = si;
          pointIndex = pi;
          break;
        }
      }
      if (segmentIndex !== undefined) break;
    }
    if (segmentIndex === undefined) return 0;
    return TrackUtils.distanceBetweenPoints(track.segments, 0, 0, segmentIndex, pointIndex!);
  }

}

export class SegmentMetadata {

  private readonly _distance = new BehaviorSubject<number>(0);
  private readonly _positiveElevation = new BehaviorSubject<number | undefined>(undefined);
  private readonly _negativeElevation = new BehaviorSubject<number | undefined>(undefined);
  private readonly _highestPoint = new BehaviorSubject<PointImpl | undefined>(undefined);
  private readonly _lowestPoint = new BehaviorSubject<PointImpl | undefined>(undefined);
  private readonly _duration = new BehaviorSubject<number | undefined>(undefined);
  private readonly _startPoint = new BehaviorSubject<PointImpl | undefined>(undefined);
  private readonly _bounds = new BehaviorSubject<L.LatLngBounds | undefined>(undefined);
  private _topLat: PointImpl | undefined = undefined;
  private _bottomLat: PointImpl | undefined = undefined;
  private _leftLng: PointImpl | undefined = undefined;
  private _rightLng: PointImpl | undefined = undefined;

  constructor(
    private readonly segmentPoints: PointImpl[],
  ) {}

  public get distance(): number { return this._distance.value; }
  public get distance$(): Observable<number> { return this._distance; }

  public get positiveElevation(): number | undefined { return this._positiveElevation.value; }
  public get positiveElevation$(): Observable<number | undefined> { return this._positiveElevation; }

  public get negativeElevation(): number | undefined { return this._negativeElevation.value; }
  public get negativeElevation$(): Observable<number | undefined> { return this._negativeElevation; }

  public get highestAltitude(): number | undefined { return this._highestPoint.value?.ele; }
  public get highestAltitude$(): Observable<number | undefined> { return this._highestPoint.pipe(map(pt => pt?.ele)); }

  public get lowestAltitude(): number | undefined { return this._lowestPoint.value?.ele; }
  public get lowestAltitude$(): Observable<number | undefined> { return this._lowestPoint.pipe(map(pt => pt?.ele)); }

  public get duration(): number | undefined { return this._duration.value; }
  public get duration$(): Observable<number | undefined> { return this._duration; }

  public get startDate(): number | undefined { return this._startPoint.value?.time; }
  public get startDate$(): Observable<number | undefined> { return this._startPoint.pipe(map(pt => pt?.time)); }

  public get bounds(): L.LatLngBounds | undefined { return this._bounds.value; }
  public get bounds$(): Observable<L.LatLngBounds | undefined> { return this._bounds; }

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

  cancelElevation(e: number): void {
    const subN = e <= 0 ? -e : 0;
    const subP = e >= 0 ? e : 0;
    if (this._negativeElevation.value !== undefined && subN > 0)
      this._negativeElevation.next(Math.max(0, this._negativeElevation.value - subN));
    if (this._positiveElevation.value !== undefined && subP > 0)
      this._positiveElevation.next(Math.max(0, this._positiveElevation.value - subP));
  }

  addDuration(d: number): void {
    if (d === 0) return;
    this._duration.next((this._duration.value ?? 0) + d);
  }

  pointAdded(point: PointImpl): void { // NOSONAR
    if (point.time !== undefined) {
      if (this._startPoint.value === undefined || this._startPoint.value.time! > point.time) {
        this._startPoint.next(point);
      }
    }
    if (point.ele !== undefined) {
      if (this._highestPoint.value === undefined || this._highestPoint.value.ele! < point.ele) {
        this._highestPoint.next(point);
      }
      if (this._lowestPoint.value === undefined || this._lowestPoint.value.ele! > point.ele) {
        this._lowestPoint.next(point);
      }
    }
    const p = point.pos;
    if (this._bounds.value === undefined) {
      this._bounds.next(L.latLngBounds(p, p));
      this._topLat = this._bottomLat = this._leftLng = this._rightLng = point;
    } else {
      const b = this._bounds.value;
      let changed = false;
      if (p.lat < b.getNorth()) {
        this._topLat = point;
        changed = true;
      }
      if (p.lat > b.getSouth()) {
        this._bottomLat = point;
        changed = true;
      }
      if (p.lng < b.getWest()) {
        this._leftLng = point;
        changed = true;
      }
      if (p.lng > b.getEast()) {
        this._rightLng = point;
        changed = true;
      }
      if (changed) {
        this._bounds.next(b.extend(p));
      }
    }
  }

  elevationChanged(point: PointImpl): void {
    const pointEle = point.ele;
    if (this._highestPoint.value === point || this._lowestPoint.value === point ||
      (pointEle !== undefined &&
        (this._highestPoint.value === undefined ||
        this._lowestPoint.value === undefined ||
        this._highestPoint.value.ele! < pointEle ||
        this._lowestPoint.value.ele! > pointEle))) {
          this.computeHighestAndLowest();
      }
  }

  timeChanged(point: PointImpl): void {
    if (this._startPoint.value === point || (point.time !== undefined && (this._startPoint.value === undefined || this._startPoint.value.time! > point.time)))
      this._startPoint.next(point);
  }

  positionChanged(point: PointImpl): void { // NOSONAR
    const p = point.pos;
    const b = this._bounds.value!;
    if ((this._topLat === point && p.lat > b.getNorth()) ||
        (this._bottomLat === point && p.lat < b.getSouth()) ||
        (this._leftLng === point && p.lng > b.getWest()) ||
        (this._rightLng === point && p.lng < b.getEast())) {
      this.computeBounds();
    } else {
      let changed = false;
      if (p.lat < b.getNorth()) {
        this._topLat = point;
        changed = true;
      }
      if (p.lat > b.getSouth()) {
        this._bottomLat = point;
        changed = true;
      }
      if (p.lng < b.getWest()) {
        this._leftLng = point;
        changed = true;
      }
      if (p.lng > b.getEast()) {
        this._rightLng = point;
        changed = true;
      }
      if (changed) {
        this._bounds.next(b.extend(p));
      }
    }
  }

  private computeHighestAndLowest(): void {
    let highest: PointImpl | undefined = undefined;
    let lowest: PointImpl | undefined = undefined;
    for (const pt of this.segmentPoints) {
      if (pt.ele !== undefined) {
        if (highest === undefined) {
          highest = lowest = pt;
        } else if (highest.ele! < pt.ele) {
          highest = pt;
        } else if (lowest!.ele! > pt.ele) {
          lowest = pt;
        }
      }
    }
    if (this._highestPoint.value !== highest) this._highestPoint.next(highest);
    if (this._lowestPoint.value !== lowest) this._lowestPoint.next(lowest);
  }

  private computeBounds(): void { // NOSONAR
    this._topLat = this._bottomLat = this._leftLng = this._rightLng = undefined;
    let n, s, e, w;
    let b: L.LatLngBounds | undefined = undefined;
    for (const pt of this.segmentPoints) {
      const p = pt.pos;
      if (b === undefined) {
        this._topLat = this._bottomLat = this._leftLng = this._rightLng = pt;
        n = s = p.lat;
        e = w = p.lng;
        b = L.latLngBounds(p, p);
      } else {
        let changed = false;
        if (p.lat < n!) {
          n = p.lat;
          this._topLat = pt;
          changed = true;
        }
        if (p.lat > s!) {
          s = p.lat;
          this._bottomLat = pt;
          changed = true;
        }
        if (p.lng < w!) {
          w = p.lng;
          this._leftLng = pt;
          changed = true;
        }
        if (p.lng > e!) {
          e = p.lng;
          this._rightLng = pt;
          changed = true;
        }
        if (changed) b = b.extend(p);
      }
    }
    const cb = this._bounds.value;
    if (cb === undefined || cb.getNorth() !== n || cb.getSouth() !== s || cb.getWest() !== w || cb.getEast() !== e)
      this._bounds.next(b);
  }

  computeNewPoints(points: PointImpl[]): void { // NOSONAR
    let distance = 0;
    let duration = 0;
    let positiveElevation: number | undefined = undefined;
    let negativeElevation: number | undefined = undefined;
    let highestPoint: PointImpl | undefined = this._highestPoint.value;
    let lowestPoint: PointImpl | undefined = this._lowestPoint.value;
    let startPoint = this._startPoint.value;
    let northPoint: PointImpl | undefined = this._topLat;
    let southPoint: PointImpl | undefined = this._bottomLat;
    let westPoint: PointImpl | undefined = this._leftLng;
    let eastPoint: PointImpl | undefined = this._rightLng;
    let n: number | undefined = northPoint?.pos.lat;
    let s: number | undefined = southPoint?.pos.lat;
    let w: number | undefined = westPoint?.pos.lng;
    let e: number | undefined = eastPoint?.pos.lng;
    for (const pt of points) {
      distance += pt.distanceFromPreviousPoint;
      if (pt.durationFromPreviousPoint !== undefined)
        duration += pt.durationFromPreviousPoint;
      if (pt.elevationFromPreviousPoint !== undefined) {
        if (pt.elevationFromPreviousPoint > 0)
          positiveElevation = positiveElevation ? positiveElevation + pt.elevationFromPreviousPoint : pt.elevationFromPreviousPoint;
        else
          negativeElevation = negativeElevation ? negativeElevation - pt.elevationFromPreviousPoint : -pt.elevationFromPreviousPoint;
      }
      if (pt.time !== undefined) {
        if (startPoint === undefined || startPoint.time! > pt.time) {
          startPoint = pt;
        }
      }
      const ele = pt.ele;
      if (ele !== undefined) {
        if (highestPoint === undefined || highestPoint.ele! < ele) {
          highestPoint = pt;
        }
        if (lowestPoint === undefined || lowestPoint.ele! > ele) {
          lowestPoint = pt;
        }
      }
      const p = pt.pos;
      if (n === undefined || p.lat < n) {
        n = p.lat;
        northPoint = pt;
      }
      if (s === undefined || p.lat > s) {
        s = p.lat;
        southPoint = pt;
      }
      if (w === undefined || p.lng < w) {
        w = p.lng;
        westPoint = pt;
      }
      if (e === undefined || p.lng > e) {
        e = p.lng;
        eastPoint = pt;
      }
    }
    this.addDistance(distance);
    this.addDuration(duration);
    if (positiveElevation !== undefined && (this._positiveElevation.value === undefined || positiveElevation > 0))
      this._positiveElevation.next((this._positiveElevation.value ?? 0) + positiveElevation);
    if (negativeElevation !== undefined && (this._negativeElevation.value === undefined || negativeElevation > 0))
      this._negativeElevation.next((this._negativeElevation.value ?? 0) + negativeElevation);
    if (this._startPoint.value !== startPoint) this._startPoint.next(startPoint);
    if (this._highestPoint.value !== highestPoint) this._highestPoint.next(highestPoint);
    if (this._lowestPoint.value !== lowestPoint) this._lowestPoint.next(lowestPoint);
    let boundsChanged = false;
    if (this._topLat !== northPoint) {
      this._topLat = northPoint;
      boundsChanged = true;
    }
    if (this._bottomLat !== southPoint) {
      this._bottomLat = southPoint;
      boundsChanged = true;
    }
    if (this._leftLng !== westPoint) {
      this._leftLng = westPoint;
      boundsChanged = true;
    }
    if (this._rightLng !== eastPoint) {
      this._rightLng = eastPoint;
      boundsChanged = true;
    }
    if (boundsChanged) {
      if (s === undefined) this._bounds.next(undefined);
      else this._bounds.next(L.latLngBounds(L.latLng(s, w!), L.latLng(n!, e!)));
    }
  }

}
