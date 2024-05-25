import { BehaviorSubject, Observable } from 'rxjs';
import * as L from 'leaflet';
import { PointDto } from './dto/point';

export class Point {

  private _lat: BehaviorSubject<number>;
  private _lng: BehaviorSubject<number>;
  private _ele: BehaviorSubject<number | undefined>;
  private _time: BehaviorSubject<number | undefined>;

  constructor(
    lat: number,
    lng: number,
    ele?: number,
    time?: number,
  ) {
    this._lat = new BehaviorSubject<number>(lat);
    this._lng = new BehaviorSubject<number>(lng);
    this._ele = new BehaviorSubject<number | undefined>(ele);
    this._time = new BehaviorSubject<number | undefined>(time);
  }

  public get lat(): number { return this._lat.value; }
  public get lat$(): Observable<number> { return this._lat; }

  public get lng(): number { return this._lng.value; }
  public get lng$(): Observable<number> { return this._lng; }

  public get ele(): number | undefined { return this._ele.value; }
  public get ele$(): Observable<number | undefined> { return this._ele; }

  public get time(): number | undefined { return this._time.value; }
  public get time$(): Observable<number | undefined> { return this._time; }

  public distanceTo(other: L.LatLngExpression): number {
    return L.CRS.Earth.distance(this, other);
  }

}

export class PointDtoMapper {

  public static toPoints(dtos: PointDto[]): Point[] {
    const points: Point[] = [];
    let previousPoint: Point | undefined = undefined;
    dtos.forEach(pointDto => {
      const nextPoint = this.toPoint(pointDto, previousPoint);
      previousPoint = nextPoint;
      points.push(nextPoint);
    });
    return points;
  }


  private static toPoint(dto: PointDto, previous?: Point): Point {
    return new Point(
      this.toCoord(dto.l, previous?.lat),
      this.toCoord(dto.n, previous?.lng),
      this.toValue(dto.e, previous?.ele, 10),
      this.toValue(dto.t, previous?.time, 1)
    );
  }

  private static toCoord(value: number | undefined, previous: number | undefined): number {
    if (value === undefined) return previous!;
    if (previous === undefined) return parseFloat((value / 1000000).toFixed(6));
    return previous + parseFloat((value / 1000000).toFixed(6));
  }

  private static toValue(value: number | undefined, previous: number | undefined, factor: number): number | undefined {
    if (value === undefined) return previous;
    if (previous === undefined) return value === undefined ? undefined : this.divideFactor(value, factor);
    return previous + this.divideFactor(value, factor);
  }

  private static divideFactor(value: number, factor: number): number {
    if (factor === 1) return value;
    if ((value % factor) === 0) return Math.floor(value / factor);
    return value / factor;
  }

  public static toDto(point: Point, previous?: Point): PointDto {
    if (!previous) return {
      l: Math.floor(point.lat * 1000000),
      n: Math.floor(point.lng * 1000000),
      e: point.ele !== undefined ? Math.floor(point.ele * 10) : undefined,
      t: point.time
    };
    const dto: PointDto = {};
    if (point.lat !== previous.lat) dto.l = this.diffCoord(point.lat, previous.lat);
    if (point.lng !== previous.lng) dto.n = this.diffCoord(point.lng, previous.lng);
    if (point.ele !== previous.ele) dto.e = this.diff(point.ele, previous.ele, 10);
    if (point.time !== previous.time) dto.t = this.diff(point.time, previous.time, 1);
    return dto;
  }

  private static diffCoord(newValue: number, previousValue: number | undefined): number | undefined {
    if (previousValue === undefined) return Math.floor(newValue * 1000000);
    return Math.floor(newValue * 1000000) - Math.floor(previousValue * 1000000);
  }

  private static diff(newValue: number | undefined, previousValue: number | undefined, factor: number): number  | undefined {
    if (newValue === undefined) return undefined;
    if (previousValue === undefined) return newValue === undefined ? undefined : (factor !== 1 ? Math.floor(newValue * factor) : newValue);
    if (factor === 1)
      return newValue - previousValue;
    return Math.floor(newValue * factor) - Math.floor(previousValue * factor);
  }

}