import { MapPrimitive, MapPrimitiveEvents } from '@trailence/components/map/primitives/primitive';
import { MapLibre } from '../maplibre';
import { MapLibrePrimitive } from './primitive';
import { MapLibreUtils } from '../maplibre-utils';

export class MapLibrePrimitiveEvents<O, P extends MapPrimitive<O, MapLibre, P> & MapLibrePrimitive> extends MapPrimitiveEvents<O, MapLibre, P> {

  constructor() {
    super();
    this.addedToMap.addListener(e => {
      const map = e.renderer.getMaplibreMap()!;
      for (const layerId of e.primitive.getLayersIds()) {
        map.on('mousemove', layerId, e2 => {
          this.hover.trigger(() => ({primitive: e.primitive, pointerEvent: MapLibreUtils.toMapPointerEvent(e.renderer, e2)}));
        });
        map.on('mouseleave', layerId, _ => {
          this.hover.trigger(() => ({primitive: e.primitive, pointerEvent: undefined}));
        });
        map.on('click', e2 => {
          this.click.trigger(() => ({primitive: e.primitive, pointerEvent: MapLibreUtils.toMapPointerEvent(e.renderer, e2)}));
        });
      }
    });
  }

}
