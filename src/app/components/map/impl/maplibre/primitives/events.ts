import { MapPrimitive, MapPrimitiveEvents } from '@trailence/components/map/primitives/primitive';
import { MapLibre } from '../maplibre';
import { MapLibrePrimitive } from './primitive';

export class MapLibrePrimitiveEvents<O, P extends MapPrimitive<O, MapLibre, P> & MapLibrePrimitive> extends MapPrimitiveEvents<O, MapLibre, P> {

  // TODO

}
