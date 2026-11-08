import { distance, EarthBBox } from '@trailence/utils/latlng';
import { LngLatBounds, MapLibreMap } from 'maplibre-gl';

export class MapLibreUtils {

  public static pixelsToMeters(map: MapLibreMap, pixels: number): number {
    // Get the center of the map in pixel coordinates and lat/lng
    const centerPt = map.getCenter();
    const centerPointScreen = map.project(centerPt);

    // Pick a point 1 pixel to the right
    const rightPointScreen = [centerPointScreen.x + 1, centerPointScreen.y] as [number, number];
    const rightLatLng = map.unproject(rightPointScreen);

    // Use the Haversine formula to find the distance in meters for 1 pixel
    return distance(centerPt, rightLatLng) * pixels;
  }

  public static fromMapLibreBounds(bounds: LngLatBounds): EarthBBox {
    return {
      minlat: bounds.getSouth(),
      maxlat: bounds.getNorth(),
      minlng: bounds.getWest(),
      maxlng: bounds.getEast(),
    }
  }

  public static toMapLibreBounds(bounds: EarthBBox): LngLatBounds {
    return new LngLatBounds([bounds.minlng, bounds.minlat, bounds.maxlng, bounds.maxlat]);
  }

}
