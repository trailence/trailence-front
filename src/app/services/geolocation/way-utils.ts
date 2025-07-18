import { Way, WayPermission } from './way';
import * as L from 'leaflet';

export class WayUtils {

  public static getMatchingWays(pos: L.LatLngLiteral, ways: Way[], maxDistance: number = 2.5): Way[] {
    const matching: Way[] = [];
    const p = L.latLng(pos.lat, pos.lng);
    const pPt = L.point(pos.lat, pos.lng);
    for (const way of ways) {
      if (way.points.find(pt => p.distanceTo(pt) <= maxDistance)) {
        matching.push(way);
      } else {
        let p1 = L.point(way.points[0].lat, way.points[0].lng);
        for (let i = 1; i < way.points.length - 1; ++i) {
          let p2 = L.point(way.points[i].lat, way.points[i].lng);
          const distance = L.LineUtil.pointToSegmentDistance(pPt, p1, p2);
          if (p.distanceTo({lat: pos.lat + distance, lng: pos.lng}) <= maxDistance) {
            matching.push(way);
            break;
          }
          p1 = p2;
        }
      }
    }
    return matching;
  }


  public static mergeWays(ways: Way[]): Way[] {
    if (ways.length < 2) return ways;
    for (let i = 0; i < ways.length; ++i) {
      const way = ways[i];
      let merged = false;
      let start = way.points[0];
      let way2Index = this.findSingleWayStartingAt(start.lat, start.lng, ways, i + 1, way.permission);
      if (way2Index >= 0) {
        this.merge(way, ways[way2Index]);
        ways.splice(way2Index, 1);
        merged = true;
      }
      start = way.points[way.points.length - 1];
      way2Index = this.findSingleWayStartingAt(start.lat, start.lng, ways, i + 1, way.permission);
      if (way2Index >= 0) {
        this.merge(way, ways[way2Index]);
        ways.splice(way2Index, 1);
        merged = true;
      }
      if (merged) i--;
    }
    return ways;
  }

  private static findSingleWayStartingAt(lat: number, lng: number, ways: Way[], i: number, permission: WayPermission | undefined): number {
    let found = -1;
    for (; i < ways.length; ++i) {
      const way = ways[i];
      if (way.permission != permission) continue;
      if (way.points[0].lat === lat && way.points[0].lng === lng) {
        if (found !== -1) return -1;
        found = i;
        continue;
      }
      const l = way.points.length - 1;
      if (way.points[l].lat === lat && way.points[l].lng === lng) {
        if (found !== -1) return -1;
        found = i;
      }
    }
    return found;
  }

  private static merge(w1: Way, w2: Way): void {
    const l1 = w1.points.length - 1;
    const l2 = w2.points.length - 1;
    if (w2.points[0].lat === w1.points[0].lat && w2.points[0].lng === w1.points[0].lng) {
      // first point of w2 matches with first point of w1 => w2 goes before w1, but reverse way
      w1.points.splice(0, 0, ...w2.points.reverse());
    } else if (w2.points[0].lat === w1.points[l1].lat && w2.points[0].lng === w1.points[l1].lng) {
      // first point of w2 matches with last point of w1 => append points
      w1.points.push(...w2.points);
    } else if (w2.points[l2].lat === w1.points[0].lat && w2.points[l2].lng === w1.points[0].lng) {
      // last point of w2 matches with first point of w1 => insert points at beginning
      w1.points.splice(0, 0, ...w2.points);
    } else {
      // last point of w2 matches with last point of w1 => append points, but reverse way
      w1.points.push(...w2.points.reverse());
    }
    w1.id = w1.id + '-' + w2.id;
    if (!w1.bounds) w1.bounds = w2.bounds;
    else if (w2.bounds) w1.bounds = {
      minlat: Math.min(w1.bounds.minlat, w2.bounds.minlat),
      maxlat: Math.max(w1.bounds.maxlat, w2.bounds.maxlat),
      minlon: Math.min(w1.bounds.minlon, w2.bounds.minlon),
      maxlon: Math.max(w1.bounds.maxlon, w2.bounds.maxlon),
    };
  }

}
