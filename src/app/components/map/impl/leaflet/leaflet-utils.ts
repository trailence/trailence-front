import { EarthBBox } from '@trailence/utils/latlng';
import * as L from 'leaflet';
import { MapRenderer } from '../map-renderer';
import { MapPointerEvent } from '../../map-events';

export class LeafletUtils {

  public static toLeafletBounds(bounds: EarthBBox): L.LatLngBounds {
    return L.latLngBounds(L.latLng(bounds.minlat, bounds.minlng), L.latLng(bounds.maxlat, bounds.maxlng));
  }

  public static fromLeafletBounds(bounds: L.LatLngBounds): EarthBBox {
    return {
      minlat: bounds.getSouth(),
      maxlat: bounds.getNorth(),
      minlng: bounds.getWest(),
      maxlng: bounds.getEast(),
    }
  }

  public static toMapPointerEvent(renderer: MapRenderer, e: L.LeafletMouseEvent): MapPointerEvent {
    return {
      renderer,
      geographicPoint: e.latlng,
      viewportPoint: e.containerPoint,
      nativeEvent: e.originalEvent,
    };
  }
}
