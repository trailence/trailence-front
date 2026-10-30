import { NestedArray } from '@trailence/utils/arrays';
import { EarthPoint } from '@trailence/utils/latlng';

export class MapUtils {

  public static adjustPointsToAvoidGoingAroundEarth<T extends NestedArray<EarthPoint>[]>(points: T): T {
    return this.adjustPointsToAvoidGoingAroundEarthRecursive(points, undefined).result;
  }

  private static adjustPointsToAvoidGoingAroundEarthRecursive<T extends NestedArray<EarthPoint>[]>(level: T, previous: EarthPoint | undefined): {result: T, previous: EarthPoint | undefined} {
    if (level.length === 0) return {result: [] as unknown as T, previous};
    if (Array.isArray(level[0])) {
      // nested level
      const result: T = [] as unknown as T;
      for (const element of level) {
        const r = this.adjustPointsToAvoidGoingAroundEarthRecursive(element as NestedArray<EarthPoint>[], previous);
        result.push(r.result);
        previous = r.previous;
      }
      return {result, previous};
    }
    // leaf level
    const result: EarthPoint[] = [];
    for (const point of (level as EarthPoint[])) {
      if (previous === undefined) {
        previous = point;
        result.push(point);
        continue;
      }
      let lat = point.lat;
      // going from 80 to -80 => 80 - -80 = 160
      while (previous.lat - lat > 160) lat += 180;
      // going from -80 to 80 => -80 - 80 = -160
      while (previous.lat - lat < -160) lat -= 180;
      let lng = point.lng;
      while (previous.lng - lng > 340) lng += 360;
      while (previous.lng - lng < -340) lng -= 360;
      const p = lat === point.lat && lng === point.lng ? point : {lat, lng, ele: point.ele};
      result.push(p);
      previous = p;
    }
    return {result: result as T, previous};
  }

}
