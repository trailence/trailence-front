import { EarthBBox } from '@trailence/utils/latlng';
import * as L from 'leaflet';

export class LeafletUtils {

  public static toLeafletBounds(bounds: EarthBBox): L.LatLngBounds {
    return L.latLngBounds(L.latLng(bounds.minlng, bounds.maxlat), L.latLng(bounds.maxlng, bounds.minlat));
  }

  public static fromLeafletBounds(bounds: L.LatLngBounds): EarthBBox {
    return {
      minlat: bounds.getNorth(),
      maxlat: bounds.getSouth(),
      minlng: bounds.getWest(),
      maxlng: bounds.getEast(),
    }
  }
}
