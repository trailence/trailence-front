import { Arrays } from '@trailence/utils/arrays';
import { Way } from './way';
import { ClosestMatch, EarthPoint, findClosestPointOnPath } from '@trailence/utils/latlng';

export class WayUtils {

  public static getClosestPointsOnWays(pos: EarthPoint, ways: Way[], maxDistance: number = 2.5): {way: Way, closest: ClosestMatch}[] {
    const result: {way: Way, closest: ClosestMatch}[] = [];
    for (const way of ways) {
      const closest = findClosestPointOnPath(way.points, pos, maxDistance);
      if (closest) result.push({way, closest});
    }
    return result;
  }
  /*
  public static getMatchingWays(pos: EarthPoint, ways: Way[], maxDistance: number = 2.5): Way[] {
    const matching: Way[] = [];
    for (const way of ways) {
      if (way.points.some(pt => distance(pos, pt) <= maxDistance)) {
        matching.push(way);
      } else {
        const match = findClosestPointOnPath(way.points, pos, maxDistance);
        if (match) matching.push(way);
      }
    }
    return matching;
  }*/

  public static findClosestWayPoint(pos: EarthPoint, ways: Way[], maxDistance: number = 2.5): {way: Way, match: ClosestMatch} | undefined {
    let best: {way: Way, match: ClosestMatch} | undefined = undefined;
    for (const way of ways) {
      const match = findClosestPointOnPath(way.points, pos, maxDistance);
      if (!match) continue;
      if (match.distanceMeters === 0) return {way, match};
      if (!best || match.distanceMeters < best.match.distanceMeters) best = {way, match};
    }
    return best;
  }

  public static mergeWays(ways: Way[], mergePredicate: (way1: Way, way2: Way) => boolean): Way[] {
    if (ways.length < 2) return ways;
    for (let i = 0; i < ways.length; ++i) {
      const way = ways[i];
      let merged = false;
      let start = way.points[0];
      let way2Index = this.findSingleWayStartingAt(start.lat, start.lng, ways, i + 1, (w2) => mergePredicate(way, w2));
      if (way2Index >= 0) {
        this.merge(way, ways[way2Index]);
        ways.splice(way2Index, 1);
        merged = true;
      }
      start = way.points.at(-1)!;
      way2Index = this.findSingleWayStartingAt(start.lat, start.lng, ways, i + 1, (w2) => mergePredicate(way, w2));
      if (way2Index >= 0) {
        this.merge(way, ways[way2Index]);
        ways.splice(way2Index, 1);
        merged = true;
      }
      if (merged) i--;
    }
    return ways;
  }

  private static findSingleWayStartingAt(lat: number, lng: number, ways: Way[], i: number, mergePredicate: (way: Way) => boolean): number {
    let found = -1;
    for (; i < ways.length; ++i) {
      const way = ways[i];
      if (!mergePredicate(way)) continue;
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
      w1.points.splice(0, 0, ...Arrays.toReversed(w2.points));
    } else if (w2.points[0].lat === w1.points[l1].lat && w2.points[0].lng === w1.points[l1].lng) {
      // first point of w2 matches with last point of w1 => append points
      w1.points.push(...w2.points);
    } else if (w2.points[l2].lat === w1.points[0].lat && w2.points[l2].lng === w1.points[0].lng) {
      // last point of w2 matches with first point of w1 => insert points at beginning
      w1.points.splice(0, 0, ...w2.points);
    } else {
      // last point of w2 matches with last point of w1 => append points, but reverse way
      w1.points.push(...Arrays.toReversed(w2.points));
    }
    w1.id = w1.id + '-' + w2.id;
  }

}
