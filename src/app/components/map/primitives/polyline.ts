import { EarthPoint } from '@trailence/utils/latlng';
import { Color } from '@trailence/utils/color';
import { MapPrimitiveMultiplePositions } from './primitive';
import { MapRenderer } from '../impl/map-renderer';

export interface PolylineOptions {
  color: Color;
  width: number;
  interactiveData: any;
}

export abstract class Polyline<R extends MapRenderer> extends MapPrimitiveMultiplePositions<PolylineOptions, R, EarthPoint[][]> {

  constructor(
    id: string,
    segments: EarthPoint[][],
    options: PolylineOptions,
  ) {
    super(id, segments, options);
  }

}
