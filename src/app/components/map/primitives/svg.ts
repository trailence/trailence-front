import { MapRenderer } from '../impl/map-renderer';
import { MapPrimitiveBounds } from './primitive';

export interface SvgBoundsOptions {
  interactiveData?: any;
  // TODO className
}

export abstract class SvgBoundsPrimitive<R extends MapRenderer> extends MapPrimitiveBounds<SvgBoundsOptions, R> {

}
