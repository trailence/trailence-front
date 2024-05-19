import { BehaviorSubject, Observable, combineLatest, map, mergeMap } from 'rxjs';
import { Segment, SegmentMetadata } from './segment';
import { Versioned } from './versioned';
import { Point } from './point';

export class Track extends Versioned {

  private _segments = new BehaviorSubject<Segment[]>([]);
  private _meta = new TrackMetadata(this._segments);

  public get segments(): Segment[] { return this._segments.value; }
  public get segments$(): Observable<Segment[]> { return this._segments; }

  public get metadata(): TrackMetadata { return this._meta };

  constructor(
    fields?: Partial<Track>
  ) {
    super(fields);
    fields?.segments?.map(s => {
      const segment = this.newSegment();
      s.points.map(pt => {
        segment.append(new Point(pt.lat, pt.lng, pt.ele, pt.time));
      });
    });
  }

  public newSegment(): Segment {
    const s = new Segment(this);
    this._segments.value.push(s);
    this._segments.next(this._segments.value);
    return s;
  }

}

export class TrackMetadata {

  private _distance = new BehaviorSubject<number>(0);
  private _positiveElevation = new BehaviorSubject<number>(0);
  private _negativeElevation = new BehaviorSubject<number>(0);
  private _highestAltitude = new BehaviorSubject<number | undefined>(undefined);
  private _lowestAltitude = new BehaviorSubject<number | undefined>(undefined);
  private _duration = new BehaviorSubject<number>(0);

  constructor(
    segments$: Observable<Segment[]>
  ) {
    this.addition(segments$, meta => meta.distance$, this._distance);
    this.addition(segments$, meta => meta.positiveElevation$, this._positiveElevation);
    this.addition(segments$, meta => meta.negativeElevation$, this._negativeElevation);
    this.addition(segments$, meta => meta.duration$, this._duration);
    this.highest(segments$, meta => meta.highestAltitude$, this._highestAltitude);
    this.lowest(segments$, meta => meta.lowestAltitude$, this._lowestAltitude);
  }

  public get distance(): number { return this._distance.value; }
  public get distance$(): Observable<number> { return this._distance; }

  public get positiveElevation(): number { return this._positiveElevation.value; }
  public get positiveElevation$(): Observable<number> { return this._positiveElevation; }

  public get negativeElevation(): number { return this._negativeElevation.value; }
  public get negativeElevation$(): Observable<number> { return this._negativeElevation; }

  public get highestAltitude(): number | undefined { return this._highestAltitude.value; }
  public get highestAltitude$(): Observable<number | undefined> { return this._highestAltitude; }

  public get lowestAltitude(): number | undefined { return this._lowestAltitude.value; }
  public get lowestAltitude$(): Observable<number | undefined> { return this._lowestAltitude; }

  public get duration(): number { return this._duration.value; }
  public get duration$(): Observable<number> { return this._duration; }

  private addition(segments$: Observable<Segment[]>, getter: (meta: SegmentMetadata) => Observable<number>, target: BehaviorSubject<number>): void {
    this.reduce(segments$, getter, (a,b) => a + b, 0, target);
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
      mergeMap(segments =>
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
