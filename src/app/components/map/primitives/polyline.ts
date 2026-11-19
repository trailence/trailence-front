import { EarthPoint } from '@trailence/utils/latlng';
import { Color } from '@trailence/utils/color';
import { MapPrimitiveMultiplePositions } from './primitive';
import { MapRenderer } from '../impl/map-renderer';

export interface PolylineOptions {
  color: Color;
  width: number;
  dashArray?: number[];
}

export abstract class Polyline<R extends MapRenderer, P extends Polyline<R,P>> extends MapPrimitiveMultiplePositions<PolylineOptions, R, EarthPoint[][], P> {

}
