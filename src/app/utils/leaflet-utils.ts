import * as L from 'leaflet';
import { earthBBox, EarthBBox, normalizeLatitude, normalizeLongitude, normalizePoint } from './latlng';

export class LeafletUtils {

  /** clean bounds to remove the ones contained in an other one */
  public static cleanBounds(allBounds: L.LatLngBounds[]): void {
    for (let i = 1; i < allBounds.length; ++i) {
      const b1 = allBounds[i];
      let remove = false;
      for (let j = 0; j < i; ++j) {
        const b2 = allBounds[j];
        if (b2.contains(b1)) {
          remove = true;
          break;
        }
      }
      if (remove) {
        allBounds.splice(i, 1);
        i--;
      }
    }
  }

  public static toNormalizedPoint(point: L.LatLng): L.LatLng {
    return L.latLng(normalizeLatitude(point.lat), normalizeLongitude(point.lng));
  }

  public static boundsToMap(bounds: L.LatLngBounds, map: L.Map): L.LatLngBounds {
    const originalSw = bounds.getSouthWest();
    const sw = this.pointToMap(originalSw, map);
    if (sw.lat === originalSw.lat && sw.lng === originalSw.lng) return bounds;
    const originalNe = bounds.getNorthEast();
    const ne = {lat: originalNe.lat + sw.lat - originalSw.lat, lng: originalNe.lng + sw.lng - originalSw.lng};
    return L.latLngBounds(sw, ne);
  }

  public static pointToMap(point: L.LatLng, map: L.Map): L.LatLng {
    const bounds = map.getBounds();
    const lat = this.toMapLatitude(point.lat, bounds);
    const lng = this.toMapLongitude(point.lng, bounds);
    if (lat !== point.lat || lng !== point.lng) return L.latLng(lat, lng);
    return point;
  }

  private static toMapLongitude(longitude: number, mapBounds: L.LatLngBounds): number {
    let val = normalizeLongitude(longitude);
    let min = Math.min(mapBounds.getWest(), mapBounds.getEast());
    let max = Math.max(mapBounds.getWest(), mapBounds.getEast());
    if (val >= min && val <= max) return val;
    while (val > max) {
      val -= 360;
    }
    while (val < min) {
      val += 360;
    }
    if (val >= min && val <= max) return val;
    return longitude;
  }

  private static toMapLatitude(latitude: number, mapBounds: L.LatLngBounds): number {
    let val = normalizeLatitude(latitude);
    let min = Math.min(mapBounds.getSouth(), mapBounds.getNorth());
    let max = Math.max(mapBounds.getSouth(), mapBounds.getNorth());
    if (val >= min && val <= max) return val;
    while (val > max) {
      val -= 360;
    }
    while (val < min) {
      val += 360;
    }
    if (val >= min && val <= max) return val;
    return latitude;
  }

}

export const APPROXIMATE_METERS_PER_DEGREE = 111320;

export function boundingBoxAround(point: L.LatLngLiteral, distanceMeters: number): L.LatLngBounds {
  const latOffset = distanceMeters / APPROXIMATE_METERS_PER_DEGREE;
  const lngOffset = distanceMeters / (APPROXIMATE_METERS_PER_DEGREE * Math.cos(point.lat * Math.PI / 180));
  return L.latLngBounds(
    L.latLng(point.lat - latOffset, point.lng - lngOffset),
    L.latLng(point.lat + latOffset, point.lng + lngOffset)
  );
}

export function extendsAround(bounds: L.LatLngBounds, distanceMeters: number): L.LatLngBounds {
  const south = bounds.getSouth() - (distanceMeters / APPROXIMATE_METERS_PER_DEGREE);
  const west = bounds.getWest() - (distanceMeters / (APPROXIMATE_METERS_PER_DEGREE * Math.cos(south * Math.PI / 180)));
  const north = bounds.getNorth() + (distanceMeters / APPROXIMATE_METERS_PER_DEGREE);
  const east = bounds.getEast() + (distanceMeters / (APPROXIMATE_METERS_PER_DEGREE * Math.cos(north * Math.PI / 180)));
  return L.latLngBounds(L.latLng(south, west), L.latLng(north, east));
}

export class BoundsBuilder {
  private _bounds: L.LatLngBounds | undefined;

  public extend(bounds: L.LatLngBounds | undefined) {
    if (!bounds) return;
    if (this._bounds) this._bounds = this._bounds.extend(bounds);
    else this._bounds = L.latLngBounds(bounds.getSouthWest(), bounds.getNorthEast());
  }

  public extendPoint(point: L.LatLng) {
    if (this._bounds) this._bounds.extend(point);
    else this._bounds = L.latLngBounds(point, point);
  }

  public pad(pad: number) {
    if (this._bounds) this._bounds = this._bounds.pad(pad);
  }

  public getBounds(): L.LatLngBounds | undefined { return this._bounds; }
}

export function latLngBoundsToEarthBBox(bounds: L.LatLngBounds): EarthBBox {
  return earthBBox(bounds.getNorthEast(), bounds.getSouthWest());
}
