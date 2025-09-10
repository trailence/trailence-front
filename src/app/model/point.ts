import { PointDescriptor } from './point-descriptor';
import { Track } from './track';

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
  durationFromStart(track: Track): number;
  distanceFromStart(track: Track): number;

}

export function samePosition(p1?: L.LatLngLiteral, p2?: L.LatLngLiteral): boolean {
  if (!p1) return !p2;
  if (!p2) return false;
  return p1.lat === p2.lat && p1.lng === p2.lng;

}

export function samePositionRound(p1: L.LatLngLiteral, p2: L.LatLngLiteral, roundFactor = 1000000): boolean {
  const lat1 = Math.floor(p1.lat * roundFactor);
  const lng1 = Math.floor(p1.lng * roundFactor);
  const lat2 = Math.floor(p2.lat * roundFactor);
  const lng2 = Math.floor(p2.lng * roundFactor);
  return Math.abs(lat1 - lat2) <= 1 && Math.abs(lng1 - lng2) <= 1;

}
