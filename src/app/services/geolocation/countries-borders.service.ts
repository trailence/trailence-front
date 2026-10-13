import { Injectable } from '@angular/core';
import { PendingRequests } from '@trailence/utils/pending-requests';
import { HttpService } from '../http/http.service';
import { environment } from '@env/environment';
import { firstValueFrom } from 'rxjs';
import { getLogger } from '@trailence/utils/console';
import { EarthBBox } from '@trailence/utils/latlng';

const logger = getLogger('countries-border.service');

// [longitude, latitude]
type Point = [number, number];
// One exterior ring per polygon.
type CountryBorders = Point[][];

const EARTH_RADIUS_KM = 6371.0088;

@Injectable({ providedIn: 'root' })
export class CountriesBordersService {

  constructor(
    private readonly http: HttpService,
  ) {}

  public static readonly KNOWN_COUNTRIES: string[] = ['be','ch','es','fr','no','se','us'];

  private _cache = new Map<string, CountryBorders>();
  private _pending = new PendingRequests<CountryBorders>();

  public async getBorders(country: string): Promise<CountryBorders> {
    if (!CountriesBordersService.KNOWN_COUNTRIES.includes(country)) return [];
    if (this._cache.has(country)) return this._cache.get(country)!;
    const borders = await this._pending.request(country, () => this._load(country));
    if (borders)
      this._cache.set(country, borders);
    return borders ?? [];
  }

  private async _load(country: string): Promise<CountryBorders | null> {
    try {
      const result = await firstValueFrom(this.http.get<CountryBorders>(environment.assetsUrl + '/countries/' + country + '.borders.1.json'));
      if (result && Array.isArray(result)) {
        logger.info('Country borders loaded', country);
        return result;
      }
    } catch (e) {
      logger.error('Error downloading country borders', country, e);
    }
    return null;
  }

  public async getOverlappingCountriesSorted(bounds: EarthBBox, countries: string[] = CountriesBordersService.KNOWN_COUNTRIES): Promise<string[]> {
    const map = new Map<string, CountryBorders>();
    const promises: Promise<any>[] = [];
    for (const country of countries) {
      promises.push(this.getBorders(country).then(borders => map.set(country, borders)));
    }
    await Promise.all(promises);
    const result: {country: string, area: number}[] = [];
    for (const [country, borders] of map.entries()) {
      if (borders.length === 0) continue;
      const countryBBoxes = this.getCountryBBoxes(country, borders);
      const area = getIntersectionAreaKm2(bounds, borders, countryBBoxes);
      if (area > 0) result.push({country, area});
    }
    return result.sort((c1, c2) => c2.area - c1.area).map(c => c.country);
  }

  private _countryBboxCaches = new Map<string, EarthBBox[]>();
  private getCountryBBoxes(country: string, borders: CountryBorders): EarthBBox[] {
    if (this._countryBboxCaches.has(country)) return this._countryBboxCaches.get(country)!;
    const bboxes = computeBoundingBoxes(borders);
    this._countryBboxCaches.set(country, bboxes);
    return bboxes;
  }

}


/**
 * Compute one bounding box per polygon.
 * The result order matches the borders array.
 */
function computeBoundingBoxes(borders: CountryBorders): EarthBBox[] {
  return borders.map((ring) => {
    let minlat = Infinity;
    let maxlat = -Infinity;
    let minlng = Infinity;
    let maxlng = -Infinity;

    for (const point of ring) {
      if (
        point.length < 2 ||
        !Number.isFinite(point[0]) ||
        !Number.isFinite(point[1])
      ) {
        continue;
      }

      const [lng, lat] = point;

      minlng = Math.min(minlng, lng);
      maxlng = Math.max(maxlng, lng);
      minlat = Math.min(minlat, lat);
      maxlat = Math.max(maxlat, lat);
    }

    return {
      minlat,
      maxlat,
      minlng,
      maxlng,
    };
  });
}

/**
 * Return the intersection area in km².
 *
 * Pass precomputed polygonBoxes to avoid recomputing
 * bounding boxes every time the map moves.
 */
function getIntersectionAreaKm2(
  bbox: EarthBBox,
  borders: CountryBorders,
  polygonBoxes: EarthBBox[],
): number {
  let totalArea = 0;

  for (let i = 0; i < borders.length; i++) {
    const box = polygonBoxes[i];

    if (!box || !intersects(bbox, box)) {
      continue;
    }

    const clipped = clipToBBox(borders[i], bbox);

    if (clipped.length >= 3) {
      totalArea += sphericalPolygonAreaKm2(clipped);
    }
  }

  return totalArea;
}

function intersects(a: EarthBBox, b: EarthBBox): boolean {
  return (
    a.minlng <= b.maxlng &&
    a.maxlng >= b.minlng &&
    a.minlat <= b.maxlat &&
    a.maxlat >= b.minlat
  );
}

function clipToBBox(
  ring: number[][],
  bbox: EarthBBox,
): Point[] {
  let polygon: Point[] = ring
    .filter(
      (p) =>
        p.length >= 2 &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]),
    )
    .map((p) => [p[0], p[1]] as Point);

  // Remove duplicate closing point.
  if (polygon.length > 1) {
    const first = polygon[0];
    const last = polygon[polygon.length - 1];

    if (first[0] === last[0] && first[1] === last[1]) {
      polygon.pop();
    }
  }

  if (polygon.length < 3) return [];

  polygon = clipPolygon(polygon, 0, bbox.minlng, true);
  polygon = clipPolygon(polygon, 0, bbox.maxlng, false);
  polygon = clipPolygon(polygon, 1, bbox.minlat, true);
  polygon = clipPolygon(polygon, 1, bbox.maxlat, false);

  return polygon;
}

function clipPolygon(
  polygon: Point[],
  axis: 0 | 1,
  bound: number,
  keepGreater: boolean,
): Point[] {
  if (polygon.length === 0) return [];

  const output: Point[] = [];

  const inside = (p: Point): boolean =>
    keepGreater ? p[axis] >= bound : p[axis] <= bound;

  const intersection = (a: Point, b: Point): Point => {
    const delta = b[axis] - a[axis];

    if (delta === 0) return [a[0], a[1]];

    const t = (bound - a[axis]) / delta;

    return [
      a[0] + t * (b[0] - a[0]),
      a[1] + t * (b[1] - a[1]),
    ];
  };

  let previous = polygon[polygon.length - 1];
  let previousInside = inside(previous);

  for (const current of polygon) {
    const currentInside = inside(current);

    if (currentInside) {
      if (!previousInside) {
        output.push(intersection(previous, current));
      }

      output.push(current);
    } else if (previousInside) {
      output.push(intersection(previous, current));
    }

    previous = current;
    previousInside = currentInside;
  }

  return output;
}

function sphericalPolygonAreaKm2(polygon: Point[]): number {
  if (polygon.length < 3) return 0;

  let sum = 0;

  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];

    const lon1 = (current[0] * Math.PI) / 180;
    const lat1 = (current[1] * Math.PI) / 180;
    const lon2 = (next[0] * Math.PI) / 180;
    const lat2 = (next[1] * Math.PI) / 180;

    sum +=
      (lon2 - lon1) *
      (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  return (
    (Math.abs(sum) * EARTH_RADIUS_KM ** 2) / 2
  );
}
