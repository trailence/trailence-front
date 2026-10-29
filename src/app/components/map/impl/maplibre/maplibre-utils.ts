import { distance } from '@trailence/utils/latlng';
import { MapLibreMap } from 'maplibre-gl';

export class MapLibreUtils {

  public static pixelsToMeters(map: MapLibreMap, pixels: number): number {
    // Get the center of the map in pixel coordinates and lat/lng
    const centerPt = map.getCenter();
    const centerPointScreen = map.project(centerPt);

    // Pick a point 1 pixel to the right
    const rightPointScreen = [centerPointScreen.x + 1, centerPointScreen.y] as [number, number];
    const rightLatLng = map.unproject(rightPointScreen);

    // Use the Haversine formula to find the distance in meters for 1 pixel
    return distance(centerPt, rightLatLng);
  }

}
