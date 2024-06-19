import { BehaviorSubject, Observable } from 'rxjs';
import * as L from 'leaflet';
import { PointDto } from './dto/point';

export class Point {

  private _pos: BehaviorSubject<L.LatLng>;
  private _ele: BehaviorSubject<number | undefined>;
  private _time: BehaviorSubject<number | undefined>;

  constructor(
    lat: number,
    lng: number,
    ele?: number,
    time?: number,
  ) {
    this._pos = new BehaviorSubject<L.LatLng>(new L.LatLng(lat, lng));
    this._ele = new BehaviorSubject<number | undefined>(ele);
    this._time = new BehaviorSubject<number | undefined>(time);
  }

  public get pos(): L.LatLng { return this._pos.value; }
  public get pos$(): Observable<L.LatLng> { return this._pos; }

  public get ele(): number | undefined { return this._ele.value; }
  public get ele$(): Observable<number | undefined> { return this._ele; }

  public get time(): number | undefined { return this._time.value; }
  public get time$(): Observable<number | undefined> { return this._time; }

  public distanceTo(other: L.LatLngExpression): number {
    return L.CRS.Earth.distance(this._pos.value, other);
  }

  public samePosition(other?: L.LatLngLiteral): boolean {
    if (!other) return false;
    const p = this._pos.value;
    return p.lat === other.lat && p.lng === other.lng;
  }

}

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
      this.toValue(dto.e, previous?.ele, 10),
      this.toValue(dto.t, previous?.time, 1)
    );
  }

  private static toCoord(value: number | undefined, previous: number | undefined): number {
    if (value === undefined) return previous!;
    if (previous === undefined) return this.readCoordValue(value);
    return previous + this.readCoordValue(value);
  }

  public static readCoordValue(value: number): number {
    return parseFloat((value / 1000000).toFixed(6));
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
    return this.divideFactor(value, 10);
  }

  public static toDto(point: Point, previous?: Point): PointDto {
    const pos = point.pos;
    if (!previous) return {
      l: this.writeCoordValue(pos.lat),
      n: this.writeCoordValue(pos.lng),
      e: point.ele !== undefined ? Math.floor(point.ele * 10) : undefined,
      t: point.time
    };
    const prevPos = previous.pos;
    const dto: PointDto = {};
    if (pos.lat !== prevPos.lat) dto.l = this.diffCoord(pos.lat, prevPos.lat);
    if (pos.lng !== prevPos.lng) dto.n = this.diffCoord(pos.lng, prevPos.lng);
    dto.e = this.diff(point.ele, previous.ele, 10);
    dto.t = this.diff(point.time, previous.time, 1);
    return dto;
  }

  public static writeCoordValue(value: number): number {
    return Math.floor(value * 1000000);
  }

  public static writeElevationValue(value: number): number {
    return Math.floor(value * 10);
  }

  private static diffCoord(newValue: number, previousValue: number | undefined): number | undefined {
    if (previousValue === undefined) return Math.floor(newValue * 1000000);
    return Math.floor(newValue * 1000000) - Math.floor(previousValue * 1000000);
  }

  private static diff(newValue: number | undefined, previousValue: number | undefined, factor: number): number  | undefined {
    if (newValue === previousValue) return undefined;
    if (newValue === undefined) return 0;
    if (previousValue === undefined) return (factor !== 1 ? Math.floor(newValue * factor) : newValue);
    if (factor === 1)
      return newValue - previousValue;
    return Math.floor(newValue * factor) - Math.floor(previousValue * factor);
  }

}
