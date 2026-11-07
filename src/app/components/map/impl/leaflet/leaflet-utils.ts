import { EarthBBox } from '@trailence/utils/latlng';
import * as L from 'leaflet';

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
}
