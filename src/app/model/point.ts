import { EarthPoint } from '@trailence/utils/latlng';
import { PointDescriptor } from './point-descriptor';
import { Track } from './track';

export interface Point extends PointDescriptor {

  pos: EarthPoint;
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

  readonly computedSpeed: number | undefined;

  distanceTo(other: EarthPoint): number;
  durationFromStart(track: Track): number | undefined;
  distanceFromStart(track: Track): number;

}
