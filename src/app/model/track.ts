import { BehaviorSubject, Observable, combineLatest, concat, debounceTime, map, of, skip, switchMap } from 'rxjs';
import { Segment, SegmentMetadata } from './segment';
import { Point, PointDtoMapper } from './point';
import { Owned } from './owned';
import { TrackDto } from './dto/track';
import { WayPoint } from './way-point';
import * as L from 'leaflet';
import { BehaviorSubjectOnDemand } from '../utils/rxjs/behavior-subject-ondemand';
import { Arrays } from '../utils/arrays';
import { TypeUtils } from '../utils/type-utils';
import { calculateLongBreaksFromTrack, detectLongBreaksFromTrack } from '../services/track-edition/time/break-detection';
import { PreferencesService } from '../services/preferences/preferences.service';
import { estimateTimeForTrack } from '../services/track-edition/time/time-estimation';
import { ComputedPreferences } from '../services/preferences/preferences';
import { TrackUtils } from '../utils/track-utils';

export class Track extends Owned {

  private _segments = new BehaviorSubject<Segment[]>([]);
  private _wayPoints = new BehaviorSubject<WayPoint[]>([]);
  private _meta = new TrackMetadata(this._segments);
  private _computedMeta: TrackComputedMetadata;

  public get segments(): Segment[] { return this._segments.value; }
  public get segments$(): Observable<Segment[]> { return this._segments; }

  public get wayPoints(): WayPoint[] { return this._wayPoints.value; }
  public get wayPoints$(): Observable<WayPoint[]> { return this._wayPoints; }

  public get metadata(): TrackMetadata { return this._meta };
  public get computedMetadata(): TrackComputedMetadata { return this._computedMeta; }

  public get changes$(): Observable<any> {
    return combineLatest([
      this.segments$.pipe(
        switchMap(segments => segments.length === 0 ? of([]) : combineLatest(segments.map(s => concat(of([]), s.changes$)))),
      ),
      this.wayPoints$.pipe(
        switchMap(wayPoints => wayPoints.length === 0 ? of([]) : combineLatest(wayPoints.map(wp => concat(of([], wp.changes$))))),
      )
    ]).pipe(
      skip(1)
    );
  }

  private _computedWayPoints$ = new BehaviorSubjectOnDemand<ComputedWayPoint[]>(
    () => ComputedWayPoint.compute(this, this.preferencesService.preferences),
    this.changes$.pipe(debounceTime(250)) // invalide on changes
  );

  public get computedWayPoints$(): Observable<ComputedWayPoint[]> {
    return this._computedWayPoints$.asObservable();
  }

  constructor(
    dto: Partial<TrackDto>,
    private preferencesService: PreferencesService,
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
    this._computedMeta = new TrackComputedMetadata(this, preferencesService);
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

  public removeWayPoint(wp: WayPoint): void {
    const index = this._wayPoints.value.indexOf(wp);
    if (index >= 0) {
      this._wayPoints.value.splice(index, 1);
      this._wayPoints.next(this._wayPoints.value);
    }
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

  public get lastSegment(): Segment {
    return this.segments[this.segments.length - 1];
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
    const sub = new Track({owner: 'nobody'}, this.preferencesService);
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
    }, this.preferencesService);
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

}

export class TrackMetadata {

  private _distance = new BehaviorSubject<number>(0);
  private _positiveElevation = new BehaviorSubject<number | undefined>(undefined);
  private _negativeElevation = new BehaviorSubject<number | undefined>(undefined);
  private _highestAltitude = new BehaviorSubject<number | undefined>(undefined);
  private _lowestAltitude = new BehaviorSubject<number | undefined>(undefined);
  private _duration = new BehaviorSubject<number | undefined>(undefined);
  private _startDate = new BehaviorSubject<number | undefined>(undefined);
  private _bounds = new BehaviorSubject<L.LatLngBounds | undefined>(undefined);

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
      return L.latLngBounds(L.latLng(a.getSouth(), a.getWest()), L.latLng(a.getNorth(), a.getWest())).extend(b);
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

export class TrackComputedMetadata {

  private _breaksDuration$: BehaviorSubjectOnDemand<number>;
  private _estimatedDuration$: BehaviorSubjectOnDemand<number>;

  constructor(
    track: Track,
    preferencesService: PreferencesService,
  ) {
    const changes$ = combineLatest([preferencesService.preferences$, track.segments$.pipe(
      switchMap(segments => segments.length === 0 ? of([]) : concat(of([]), combineLatest(segments.map(s => s.changes$)))),
      debounceTime(250),
    )]);
    this._breaksDuration$ = new BehaviorSubjectOnDemand<number>(
      () => calculateLongBreaksFromTrack(track, preferencesService.preferences),
      changes$
    );
    this._estimatedDuration$ = new BehaviorSubjectOnDemand<number>(
      () => estimateTimeForTrack(track, preferencesService.preferences),
      changes$
    );
  }

  public get breaksDuration$(): Observable<number> { return this._breaksDuration$.asObservable(); }
  public get estimatedDuration$(): Observable<number> { return this._estimatedDuration$.asObservable(); }

  public breakDurationSnapshot(): number { return this._breaksDuration$.snapshot(); }
  public estimatedDurationSnapshot(): number { return this._estimatedDuration$.snapshot(); }

}

export interface BreakWayPoint {
  isBreak: boolean;
  isPause: boolean;
  isResume: boolean;
  isPauseResume: boolean;
  duration: number;
}

export class ComputedWayPoint {

  constructor(
    private _wayPoint: WayPoint,
    private _isDeparture: boolean,
    private _isArrival: boolean,
    private _break: BreakWayPoint | undefined,
    private _index: number,
    private _nearestSegmentIndex: number | undefined,
    private _nearestPointIndex: number | undefined,
    track: Track
  ) {
    if (_nearestSegmentIndex !== undefined) {
      const segment = track.segments[_nearestSegmentIndex];
      if (_wayPoint.point.time)
        this._timeSinceDeparture = TypeUtils.addOrUndefined(segment.timeSinceSegmentStart(_wayPoint.point.time), track.segmentTimeSinceDeparture(_nearestSegmentIndex));
      else {
        const point = segment.points[_nearestPointIndex!];
        if (point.time)
          this._timeSinceDeparture = TypeUtils.addOrUndefined(segment.timeSinceSegmentStart(point.time), track.segmentTimeSinceDeparture(_nearestSegmentIndex));
        else
          this._timeSinceDeparture = TypeUtils.addOrUndefined(segment.timeSinceSegmentStart(segment.nearestPoint(point.pos, p => !!p.time)?.time), track.segmentTimeSinceDeparture(_nearestSegmentIndex));
      }
      let distance = segment.distanceFromSegmentStart(_nearestPointIndex!);
      for (let i = _nearestSegmentIndex - 1; i >= 0; --i)
        distance += segment.computeTotalDistance();
      this._distanceFromDeparture = distance;
    } else if (_wayPoint.point.time && track.startDate) {
      this._timeSinceDeparture = _wayPoint.point.time - track.startDate;
    }
    if (_wayPoint.point.ele !== undefined)
      this._altitude = _wayPoint.point.ele;
    else if (_nearestSegmentIndex !== undefined)
      this._altitude = track.segments[_nearestSegmentIndex].points[_nearestPointIndex!].ele;
  }

  private _timeSinceDeparture: number | undefined;
  private _distanceFromDeparture: number | undefined;
  private _altitude: number | undefined;

  public get isDeparture(): boolean { return this._isDeparture; }
  public get isArrival(): boolean { return this._isArrival; }
  public get breakPoint(): BreakWayPoint | undefined { return this._break; }
  public get index(): number { return this._index; }
  public get wayPoint(): WayPoint { return this._wayPoint; }
  public get timeSinceDeparture(): number | undefined { return this._timeSinceDeparture; }
  public get distanceFromDeparture(): number | undefined { return this._distanceFromDeparture; }
  public get altitude(): number | undefined { return this._altitude; }

  public static compute(track: Track, preferences: ComputedPreferences): ComputedWayPoint[] {
    if (!track.departurePoint) return [];
    const wayPoints = track.wayPoints;
    if (wayPoints.length === 0) {
      // just departure / arrival
      const result = [new ComputedWayPoint(
        new WayPoint(track.departurePoint, '', ''),
        true, false, undefined, -1, 0, 0, track
      )];
      this.addBreaks(track, preferences, result);
      if (track.arrivalPoint!.distanceTo(track.departurePoint.pos) <= 25) {
        result[0]._isArrival = true;
        return result;
      }
      result.push(new ComputedWayPoint(
        new WayPoint(track.arrivalPoint!, '', ''),
        false, true, undefined, -1,
        track.segments.length - 1, track.segments[track.segments.length - 1].points.length - 1,
        track
      ));
      return result;
    }
    const eligibles: {segmentIndex: number; pointIndex: number}[][] = [];
    for (const wp of wayPoints) {
      eligibles.push(this.findEligiblePoints(wp.point, track));
    }
    while (!this.allFound(eligibles)) {
      while (this.removeUnordered(eligibles));
      if (this.allFound(eligibles)) break;
      // we cannot determine, let's take the first have more than 1 eligible, and keep the first one...
      for (const points of eligibles) {
        if (points.length > 1) {
          points.splice(1, points.length - 1);
          break;
        }
      }
    }
    // we have eligible points, create the computed
    const computed: ComputedWayPoint[] = [];
    for (let i = 0; i < eligibles.length; ++i) {
      const eligible = eligibles[i].length > 0 ? eligibles[i][0] : undefined;
      computed.push(new ComputedWayPoint(wayPoints[i], false, false, undefined, -1, eligible?.segmentIndex, eligible?.pointIndex, track));
    }
    // add breaks
    this.addBreaks(track, preferences, computed);
    // order them
    computed.sort((c1, c2) => {
      if (c1._nearestSegmentIndex !== undefined && c2._nearestSegmentIndex !== undefined) {
        if (c1._nearestSegmentIndex < c2._nearestSegmentIndex) return -1;
        if (c1._nearestSegmentIndex > c2._nearestSegmentIndex) return 1;
        if (c1._nearestPointIndex! < c2._nearestPointIndex!) return -1;
        if (c1._nearestPointIndex! > c2._nearestPointIndex!) return 1;
      }
      const index1 = wayPoints.indexOf(c1._wayPoint);
      const index2 = wayPoints.indexOf(c2._wayPoint);
      return index1 - index2;
    });
    // handle departure and arrival
    let departure, arrival;
    const firstKnownIndex = computed.findIndex(c => c._nearestSegmentIndex !== undefined);
    if (firstKnownIndex >= 0) {
      const firstKnown = computed[firstKnownIndex];
      if ((firstKnown._nearestSegmentIndex === 0 && firstKnown._nearestPointIndex === 0) ||
          (track.departurePoint && firstKnown._wayPoint.point.distanceTo(track.departurePoint.pos) < 25)) {
        // match the departure
        firstKnown._isDeparture = true;
        if (firstKnownIndex > 0) {
          computed.splice(firstKnownIndex, 1);
          computed.splice(0, 0, firstKnown);
        }
        departure = firstKnown;
      }
    }
    const lastKnownIndex = Arrays.findLastIndex(computed, c => c._nearestSegmentIndex !== undefined);
    if (lastKnownIndex >= 0) {
      const lastKnown = computed[lastKnownIndex];
      if ((lastKnown._nearestSegmentIndex === track.segments.length - 1 && lastKnown._nearestPointIndex === track.segments[track.segments.length - 1].points.length - 1) ||
          (track.arrivalPoint && lastKnown._wayPoint.point.distanceTo(track.arrivalPoint.pos) < 25)) {
        // match the arrival
        lastKnown._isArrival = true;
        if (lastKnownIndex < computed.length - 1) {
          computed.splice(lastKnownIndex, 1);
          computed.push(lastKnown);
        }
        arrival = lastKnown;
      }
    }
    if (!departure) {
      if (arrival && arrival._wayPoint.point.distanceTo(track.departurePoint.pos) <= 25) {
        arrival._isDeparture = true;
        const index = computed.indexOf(arrival);
        if (index > 0) {
          computed.splice(index, 1);
          computed.splice(0, 0, arrival);
        }
        departure = arrival;
      } else {
        departure = new ComputedWayPoint(
          new WayPoint(track.departurePoint, '', ''),
          true, !arrival && track.departurePoint.distanceTo(track.arrivalPoint!.pos) <= 25,
          undefined, -1, 0, 0, track
        );
        computed.splice(0, 0, departure);
        if (departure._isArrival) arrival = departure;
      }
    }
    if (!arrival) {
      if (track.departurePoint.distanceTo(track.arrivalPoint!.pos) <= 25) {
        departure._isArrival = true;
        arrival = departure;
      } else {
        arrival = new ComputedWayPoint(
          new WayPoint(track.arrivalPoint!, '', ''),
          false, true, undefined, -1,
          track.segments.length - 1, track.segments[track.segments.length - 1].points.length - 1,
          track
        );
        computed.push(arrival);
      }
    }
    // add index
    let index = 1;
    for (const c of computed) {
      if (!c.isDeparture && !c.isArrival && !c.breakPoint) c._index = index++;
    }
    return computed;
  }

  private static allFound(eligibles: {segmentIndex: number; pointIndex: number}[][]): boolean {
    for (const points of eligibles) if (points.length > 1) return false;
    return true;
  }

  private static removeUnordered(eligibles: {segmentIndex: number; pointIndex: number}[][]): boolean {
    let changed = false;
    for (let i = 0; i < eligibles.length; ++i) {
      const points = eligibles[i];
      if (points.length < 2) continue;
      // more than 1 eligible point, if we have points before all previous, remove them
      if (i > 0 && eligibles[i - 1].length > 0) {
        for (let j = 0; j < points.length; ++j) {
          const p = points[j];
          let beforeCount = 0;
          for (const previous of eligibles[i - 1]) {
            if (p.segmentIndex < previous.segmentIndex || (p.segmentIndex === previous.segmentIndex && p.pointIndex < previous.pointIndex)) {
              beforeCount++;
            } else {
              break;
            }
          }
          if (beforeCount === eligibles[i - 1].length) {
            // this point is before all previous, remove it
            points.splice(j, 1);
            j--;
            changed = true;
            if (points.length === 1) break;
          }
        }
      }
      if (points.length < 2) continue;
      // if we have points after all next, remove them
      if (i < eligibles.length - 1&& eligibles[i + 1].length > 0) {
        for (let j = 0; j < points.length; ++j) {
          const p = points[j];
          let afterCount = 0;
          for (const next of eligibles[i + 1]) {
            if (p.segmentIndex > next.segmentIndex || (p.segmentIndex === next.segmentIndex && p.pointIndex > next.pointIndex)) {
              afterCount++;
            } else {
              break;
            }
          }
          if (afterCount === eligibles[i + 1].length) {
            // this point is after all next, remove it
            points.splice(j, 1);
            j--;
            changed = true;
            if (points.length === 1) break;
          }
        }
      }
    }
    return changed;
  }

  private static findEligiblePoints(point: Point, track: Track): {segmentIndex: number; pointIndex: number}[] {
    const result: {segmentIndex: number; pointIndex: number}[] = [];
    const p = point.pos;
    const t = point.time;
    let currentBest: Point | undefined = undefined;
    let currentBestIndexes: {segmentIndex: number; pointIndex: number} | undefined = undefined;
    const segments = track.segments;
    for (let segmentIndex = 0; segmentIndex < segments.length; ++segmentIndex) {
      const points = segments[segmentIndex].points;
      for (let pointIndex = 0; pointIndex < points.length; ++pointIndex) {
        const pt = points[pointIndex];
        const pos = pt.pos;
        const time = pt.time;
        if (t) {
          if (time && time === t) {
            // perfect match on time, take this point except if currentBest is also a perfect match on time and is closer in distance
            if (!currentBest?.time || currentBest.time !== t || currentBest.distanceTo(p) > pos.distanceTo(p)) {
              currentBest = pt;
              currentBestIndexes = {segmentIndex, pointIndex};
            }
            continue;
          }
          // if we have a currentBest before or equals in time, and we are now later, no more to check
          if (currentBest?.time && currentBest.time <= t && time && time > t) {
            return [currentBestIndexes!];
          }
          // if the previous point was before in time, and we are now later, we take the closest
          if (pointIndex > 0 && time) {
            const previous = points[pointIndex - 1];
            if (previous.time && previous.time <= t && time > t) {
              const diff1 = previous.distanceTo(p);
              const diff2 = pos.distanceTo(p);
              return [{segmentIndex, pointIndex: diff1 <= diff2 ? pointIndex - 1 : pointIndex}];
            }
          }
        }
        const distance = pos.distanceTo(p);
        if (distance > 50) {
          // we are out of 50 meters around
          if (currentBest) {
            result.push(currentBestIndexes!);
            currentBest = undefined;
            currentBestIndexes = undefined;
          }
          continue;
        }
        // we are 50 meters around
        if (!currentBest) {
          currentBest = pt;
          currentBestIndexes = {segmentIndex, pointIndex};
          continue;
        }
        if (distance < currentBest.distanceTo(p)) {
          currentBest = pt;
          currentBestIndexes = {segmentIndex, pointIndex};
        }
      }
      // end of segment, if we have a currentBest, it is eligible
      if (currentBest) {
        result.push(currentBestIndexes!);
        currentBest = undefined;
        currentBestIndexes = undefined;
      }
    }
    return result;
  }

  private static addBreaks(track: Track, preferences: ComputedPreferences, result: ComputedWayPoint[]): void {
    const breaks = detectLongBreaksFromTrack(track, preferences.longBreakMinimumDuration, preferences.longBreakMaximumDistance);
    for (const b of breaks) {
      const pointIndex = Math.floor(b.startIndex + (b.endIndex - b.startIndex) / 2);
      const segment = track.segments[b.segmentIndex];
      const point = segment.points[pointIndex];
      const duration = TrackUtils.durationBetween(segment.points[b.startIndex], segment.points[b.endIndex]);
      result.push(new ComputedWayPoint(
        new WayPoint(point, '', ''),
        false, false,
        {
          isBreak: true,
          isPause: false,
          isResume: false,
          isPauseResume: false,
          duration
        },
        -1, b.segmentIndex, pointIndex,
        track
      ));
    }
    let previous: Segment | undefined;
    let previousIndex = -1;
    const segments = track.segments;
    for (let si = 0; si < segments.length; ++si) {
      const segment = segments[si];
      if (segment.points.length < 2) continue;
      if (previous !== undefined) {
        const distance = segment.departurePoint!.distanceTo(previous.arrivalPoint!.pos);
        const duration = TrackUtils.durationBetween(previous.arrivalPoint!, segment.departurePoint!);
        if (distance > 15) {
          result.push(new ComputedWayPoint(
            new WayPoint(previous.arrivalPoint!, '', ''),
            false, false,
            {
              isBreak: false,
              isPause: true,
              isResume: false,
              isPauseResume: false,
              duration
            },
            -1, previousIndex, previous.points.length - 1,
            track
          ));
          result.push(new ComputedWayPoint(
            new WayPoint(segment.departurePoint!, '', ''),
            false, false,
            {
              isBreak: false,
              isPause: false,
              isResume: true,
              isPauseResume: false,
              duration
            },
            -1, si, 0,
            track
          ));
        } else {
          result.push(new ComputedWayPoint(
            new WayPoint(segment.departurePoint!, '', ''),
            false, false,
            {
              isBreak: false,
              isPause: false,
              isResume: false,
              isPauseResume: true,
              duration
            },
            -1, si, 0,
            track
          ));
        }
      }
      previous = segment;
      previousIndex = si;
    }

  }

}
