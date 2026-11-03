import { MapPrimitive, MapPrimitiveEvents } from '@trailence/components/map/primitives/primitive';
import { MapLibre } from '../maplibre';
import { MapLibrePrimitive } from './primitive';

export class MapLibrePrimitiveEvents<O, P extends MapPrimitive<O, MapLibre> & MapLibrePrimitive> extends MapPrimitiveEvents<O, MapLibre, P> {

  protected override enableClickListeners(): void {
    // TODO
  }
  protected override disableClickListeners(): void {
    // TODO
  }

  protected override enableHoverListeners(): void {
    // TODO
  }
  protected override disableHoverListeners(): void {
    // TODO
  }
}
