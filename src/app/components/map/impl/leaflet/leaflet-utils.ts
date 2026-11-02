import { EarthBBox } from '@trailence/utils/latlng';
import * as L from 'leaflet';

export function toLeafletBounds(bounds: EarthBBox): L.LatLngBounds {
  return L.latLngBounds(L.latLng(bounds.minlng, bounds.maxlat), L.latLng(bounds.maxlng, bounds.minlat));
}
