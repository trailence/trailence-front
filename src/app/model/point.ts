import { BehaviorSubject, Observable, combineLatest, skip } from 'rxjs';
import * as L from 'leaflet';
import { PointDto } from './dto/point';
import { IdGenerator } from '../utils/component-utils';

export class Point {

  private _pos: BehaviorSubject<L.LatLng>;
  private _ele: BehaviorSubject<number | undefined>;
  private _time: BehaviorSubject<number | undefined>;
  private _posAccuracy: BehaviorSubject<number | undefined>;
  private _eleAccuracy: BehaviorSubject<number | undefined>;
  private _heading: BehaviorSubject<number | undefined>;
  private _speed: BehaviorSubject<number | undefined>;
  private _id = IdGenerator.generateId();

  constructor(
    lat: number,
    lng: number,
    ele?: number,
    time?: number,
    posAccuracy?: number,
    eleAccuracy?: number,
    heading?: number,
    speed?: number,
  ) {
    this._pos = new BehaviorSubject<L.LatLng>(new L.LatLng(lat, lng));
    this._ele = new BehaviorSubject<number | undefined>(ele);
    this._time = new BehaviorSubject<number | undefined>(time);
    this._posAccuracy = new BehaviorSubject<number | undefined>(posAccuracy);
    this._eleAccuracy = new BehaviorSubject<number | undefined>(eleAccuracy);
    this._heading = new BehaviorSubject<number | undefined>(heading);
    this._speed = new BehaviorSubject<number | undefined>(speed);
  }

  public get pos(): L.LatLng { return this._pos.value; }
  public get pos$(): Observable<L.LatLng> { return this._pos; }
  public set pos(p: L.LatLng) {
    const current = this._pos.value;
    if (current.lat === p.lat && current.lng === p.lng) return;
    this._pos.next(p);
  }

  public get ele(): number | undefined { return this._ele.value; }
  public get ele$(): Observable<number | undefined> { return this._ele; }
  public set ele(e: number | undefined) { if (this._ele.value !== e) this._ele.next(e); }

  public get time(): number | undefined { return this._time.value; }
  public get time$(): Observable<number | undefined> { return this._time; }
  public set time(t: number | undefined) { if (this._time.value !== t) this._time.next(t); }

  public get posAccuracy(): number | undefined { return this._posAccuracy.value; }
  public get posAccuracy$(): Observable<number | undefined> { return this._posAccuracy; }
  public set posAccuracy(pa: number | undefined) { if (this._posAccuracy.value !== pa) this._posAccuracy.next(pa); }

  public get eleAccuracy(): number | undefined { return this._eleAccuracy.value; }
  public get eleAccuracy$(): Observable<number | undefined> { return this._eleAccuracy; }
  public set eleAccuracy(ea: number | undefined) { if (this._eleAccuracy.value !== ea) this._eleAccuracy.next(ea); }

  public get heading(): number | undefined { return this._heading.value; }
  public get heading$(): Observable<number | undefined> { return this._heading; }
  public set heading(h: number | undefined) { if (this._heading.value !== h) this._heading.next(h); }

  public get speed(): number | undefined { return this._speed.value; }
  public get speed$(): Observable<number | undefined> { return this._speed; }
  public set speed(s: number | undefined) { if (this._speed.value !== s) this._speed.next(s); }

  public get changes$(): Observable<any> {
    return combineLatest([this.pos$, this.ele$, this.time$, this.posAccuracy$, this.eleAccuracy$, this.heading$, this.speed$]).pipe(
      skip(1),
    );
  }

  public distanceTo(other: L.LatLngExpression): number {
    return L.CRS.Earth.distance(this._pos.value, other);
  }

  public samePosition(other?: L.LatLngLiteral): boolean {
    if (!other) return false;
    const p = this._pos.value;
    return p.lat === other.lat && p.lng === other.lng;
  }

  public samePositionRound(other: L.LatLngLiteral): boolean {
    const lat1 = Math.floor(this._pos.value.lat * POSITION_FACTOR);
    const lng1 = Math.floor(this._pos.value.lng * POSITION_FACTOR);
    const lat2 = Math.floor(other.lat * POSITION_FACTOR);
    const lng2 = Math.floor(other.lng * POSITION_FACTOR);
    return Math.abs(lat1 - lat2) <= 1 && Math.abs(lng1 - lng2) <= 1;
  }

  public copy(): Point {
    return new Point(
      this.pos.lat,
      this.pos.lng,
      this.ele,
      this.time,
      this.posAccuracy,
      this.eleAccuracy,
      this.heading,
      this.speed
    );
  }

  public isEquals(other: Point): boolean {
    return this.pos.lat === other.pos.lat &&
      this.pos.lng === other.pos.lng &&
      this.ele === other.ele &&
      this.time === other.time &&
      this.posAccuracy === other.posAccuracy &&
      this.eleAccuracy === other.eleAccuracy &&
      this.heading === other.heading &&
      this.speed === other.speed;
  }

}

const POSITION_FACTOR = 10000000;
const ELEVATION_FACTOR = 10;
const POSITION_ACCURACY_FACTOR = 100;
const ELEVATION_ACCURACY_FACTOR = 100;
const HEADING_FACTOR = 100;
const SPEED_FACTOR = 100;

export class PointDtoMapper {

  public static toPoints(dtos: PointDto[]): Point[] {
    const points: Point[] = new Array(dtos.length);
    let previousPoint: Point | undefined = undefined;
    const nb = dtos.length;
    for (let i = 0; i < nb; ++i) {
      const nextPoint = this.toPoint(dtos[i], previousPoint);
      previousPoint = nextPoint;
      points[i] = nextPoint;
    }
    return points;
  }


  private static toPoint(dto: PointDto, previous?: Point): Point {
    const p = previous?.pos;
    return new Point(
      this.toCoord(dto.l, p?.lat),
      this.toCoord(dto.n, p?.lng),
      this.toValue(dto.e, previous?.ele, ELEVATION_FACTOR),
      this.toValue(dto.t, previous?.time, 1),
      this.toValue(dto.pa, previous?.posAccuracy, POSITION_ACCURACY_FACTOR),
      this.toValue(dto.ea, previous?.eleAccuracy, ELEVATION_ACCURACY_FACTOR),
      this.toValue(dto.h, previous?.heading, HEADING_FACTOR),
      this.toValue(dto.s, previous?.speed, SPEED_FACTOR),
    );
  }

  private static toCoord(value: number | undefined, previous: number | undefined): number {
    if (value === undefined) return previous!;
    if (previous === undefined) return this.readCoordValue(value);
    return previous + this.readCoordValue(value);
  }

  public static readCoordValue(value: number): number {
    return parseFloat((value / POSITION_FACTOR).toFixed(6));
  }

  private static toValue(value: number | undefined, previous: number | undefined, factor: number): number | undefined {
    if (value === undefined) return previous;
    if (value === 0) return undefined;
    if (previous === undefined) return this.divideFactor(value, factor);
    return previous + this.divideFactor(value, factor);
  }

  private static divideFactor(value: number, factor: number): number {
    if (factor === 1) return value;
    if ((value % factor) === 0) return Math.floor(value / factor);
    return value / factor;
  }

  public static readElevationValue(value: number): number {
    return this.divideFactor(value, ELEVATION_FACTOR);
  }

  public static toDto(point: Point, previous?: Point): PointDto {
    const pos = point.pos;
    if (!previous) return {
      l: this.writeCoordValue(pos.lat),
      n: this.writeCoordValue(pos.lng),
      e: point.ele !== undefined ? Math.floor(point.ele * ELEVATION_FACTOR) : undefined,
      t: point.time,
      pa: point.posAccuracy !== undefined ? Math.floor(point.posAccuracy * POSITION_ACCURACY_FACTOR) : undefined,
      ea: point.eleAccuracy !== undefined ? Math.floor(point.eleAccuracy * ELEVATION_ACCURACY_FACTOR) : undefined,
      h: point.heading !== undefined ? Math.floor(point.heading * HEADING_FACTOR) : undefined,
      s: point.speed !== undefined ? Math.floor(point.speed * SPEED_FACTOR) : undefined,
    };
    const prevPos = previous.pos;
    const dto: PointDto = {};
    if (pos.lat !== prevPos.lat) dto.l = this.diffCoord(pos.lat, prevPos.lat);
    if (pos.lng !== prevPos.lng) dto.n = this.diffCoord(pos.lng, prevPos.lng);
    dto.e = this.diff(point.ele, previous.ele, ELEVATION_FACTOR);
    dto.t = this.diff(point.time, previous.time, 1);
    dto.pa = this.diff(point.posAccuracy, previous.posAccuracy, POSITION_ACCURACY_FACTOR)
    dto.ea = this.diff(point.eleAccuracy, previous.eleAccuracy, ELEVATION_ACCURACY_FACTOR)
    dto.h = this.diff(point.heading, previous.heading, HEADING_FACTOR)
    dto.s = this.diff(point.speed, previous.speed, SPEED_FACTOR)
    return dto;
  }

  public static writeCoordValue(value: number): number {
    return Math.floor(value * POSITION_FACTOR);
  }

  public static writeElevationValue(value: number): number {
    return Math.floor(value * ELEVATION_FACTOR);
  }

  private static diffCoord(newValue: number, previousValue: number | undefined): number | undefined {
    if (previousValue === undefined) return Math.floor(newValue * POSITION_FACTOR);
    return Math.floor(newValue * POSITION_FACTOR) - Math.floor(previousValue * POSITION_FACTOR);
  }

  private static diff(newValue: number | undefined, previousValue: number | undefined, factor: number): number  | undefined {
    const nv = newValue === undefined ? undefined : (factor !== 1 ? Math.floor(newValue * factor) : newValue);
    const pv = previousValue === undefined ? undefined : (factor !== 1 ? Math.floor(previousValue * factor) : previousValue);
    if (nv === pv) return undefined;
    if (nv === undefined) return 0;
    if (pv === undefined) return nv;
    return nv - pv;
  }

}
