import { MapRenderer } from '../impl/map-renderer';
import { MapPrimitiveBounds } from './primitive';

export interface SvgBoundsOptions {
  // TODO className
}

export abstract class SvgBoundsPrimitive<R extends MapRenderer, P extends SvgBoundsPrimitive<R,P>> extends MapPrimitiveBounds<SvgBoundsOptions, R, P> {

}
