import { PointDto } from './dto/point';

export interface Point extends PointDescriptor {

  pos: L.LatLng;
  ele: number | undefined;
  time: number | undefined;
  posAccuracy: number | undefined;
  eleAccuracy: number | undefined;
  heading: number | undefined;
  speed: number | undefined;

  readonly distanceFromPreviousPoint: number;
  readonly durationFromPreviousPoint: number | undefined;
  readonly elevationFromPreviousPoint: number | undefined;

  readonly previousPoint: Point | undefined;
  readonly nextPoint: Point | undefined;

  distanceTo(other: L.LatLngExpression): number;

}

export interface PointDescriptor {
  pos: L.LatLngLiteral;
  ele?: number;
  time?: number;
  posAccuracy?: number;
  eleAccuracy?: number;
  heading?: number;
  speed?: number;
}

export function copyPoint(p: PointDescriptor): PointDescriptor {
  return {
    pos: {
      lat: p.pos.lat,
      lng: p.pos.lng,
    },
    ele: p.ele,
    time: p.time,
    posAccuracy: p.posAccuracy,
    eleAccuracy: p.eleAccuracy,
    heading: p.heading,
    speed: p.speed,
  }
}

export function pointsAreEqual(p1: PointDescriptor, p2: PointDescriptor): boolean {
  return p1.pos.lat === p2.pos.lat &&
    p1.pos.lng === p2.pos.lng &&
    p1.ele === p2.ele &&
    p1.time === p2.time &&
    p1.posAccuracy === p2.posAccuracy &&
    p1.eleAccuracy === p2.eleAccuracy &&
    p1.heading === p2.heading &&
    p1.speed === p2.speed;
}

export function samePosition(p1?: L.LatLngLiteral, p2?: L.LatLngLiteral): boolean {
  if (!p1) return !p2;
  if (!p2) return false;
  return p1.lat === p2.lat && p1.lng === p2.lng;

}

export function samePositionRound(p1: L.LatLngLiteral, p2: L.LatLngLiteral): boolean {
  const lat1 = Math.floor(p1.lat * 1000000);
  const lng1 = Math.floor(p1.lng * 1000000);
  const lat2 = Math.floor(p2.lat * 1000000);
  const lng2 = Math.floor(p2.lng * 1000000);
  return Math.abs(lat1 - lat2) <= 1 && Math.abs(lng1 - lng2) <= 1;

}

const POSITION_FACTOR = 10000000;
const ELEVATION_FACTOR = 10;
const POSITION_ACCURACY_FACTOR = 100;
const ELEVATION_ACCURACY_FACTOR = 100;
const HEADING_FACTOR = 100;
const SPEED_FACTOR = 100;

export class PointDtoMapper {

  public static toPoints(dtos: PointDto[]): PointDescriptor[] {
    const points: PointDescriptor[] = new Array(dtos.length);
    let previousPoint: PointDescriptor | undefined = undefined;
    const nb = dtos.length;
    for (let i = 0; i < nb; ++i) {
      const nextPoint = this.toPoint(dtos[i], previousPoint);
      previousPoint = nextPoint;
      points[i] = nextPoint;
    }
    return points;
  }


  private static toPoint(dto: PointDto, previous?: PointDescriptor): PointDescriptor {
    return {
      pos: {
        lat: this.toCoord(dto.l, previous?.pos.lat),
        lng: this.toCoord(dto.n, previous?.pos.lng),
      },
      ele: this.toValue(dto.e, previous?.ele, ELEVATION_FACTOR),
      time: this.toValue(dto.t, previous?.time, 1),
      posAccuracy: this.toValue(dto.pa, previous?.posAccuracy, POSITION_ACCURACY_FACTOR),
      eleAccuracy: this.toValue(dto.ea, previous?.eleAccuracy, ELEVATION_ACCURACY_FACTOR),
      heading: this.toValue(dto.h, previous?.heading, HEADING_FACTOR),
      speed: this.toValue(dto.s, previous?.speed, SPEED_FACTOR),
    };
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
