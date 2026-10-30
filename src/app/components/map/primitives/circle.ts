import { Color } from '@trailence/utils/color';
import { MapPrimitiveSinglePosition } from './primitive';
import { MapRenderer } from '../impl/map-renderer';

export interface CircleOptions {
  radius: number;
  radiusUnit: 'pixel' | 'meter';
  fillColor?: Color;
  strokeColor?: Color;
  strokeWidth?: number;
}

export abstract class Circle<R extends MapRenderer> extends MapPrimitiveSinglePosition<CircleOptions, R> {

}
