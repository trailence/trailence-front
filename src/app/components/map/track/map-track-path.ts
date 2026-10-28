import { Track } from '@trailence/model/track';
import * as L from 'leaflet';
import { BehaviorSubject, combineLatest, filter, map, Observable, of, Subscription, switchMap } from 'rxjs';
import { debounceTimeExtended } from '@trailence/utils/rxjs/debounce-time-extended';
import { SimplifiedTrackSnapshot } from '@trailence/model/snapshots';
import { getGradeRange, gradeColors } from '../../trail-graph/grade-values';
import { distance, EarthPoint } from '@trailence/utils/latlng';
import { LeafletUtils } from '@trailence/utils/leaflet-utils';
import { SourceSpecification } from 'maplibre-gl';
import { ElementsFor3D, LeafletElement, MapLibreElement } from '../map-element';
import { combineLatestSafe } from '@trailence/utils/rxjs/combineLatestSafe';
import { MapState } from '../map-state';

export class MapTrackPath {

  constructor(
    private readonly _track: Track | SimplifiedTrackSnapshot,
    private readonly id: string,
    color: string,
    smoothFactor: number,
    weight: number,
    fromTrack: any, // this will be the MapTrack, but any avoids circular reference
    eleColors: boolean = false,
  ) {
    this.eleColors$ = new BehaviorSubject(eleColors);
    this.path2d = new Path2D(color, smoothFactor, weight, fromTrack);
    this.path3d = new Path3D(id, color, smoothFactor, weight, fromTrack);
  }

  private eleColors$: BehaviorSubject<boolean>;
  private arrowsColor$ = new BehaviorSubject<string | undefined>(undefined);
  private pathPoints$?: BehaviorSubject<PathPoint[][]>;
  private pathPointsSubscription?: Subscription;
  private path2d: Path2D;
  private path3d: Path3D;

  public destroy() {
    this.pathPointsSubscription?.unsubscribe();
    this.pathPointsSubscription = undefined;
    this.pathPoints$ = undefined
  }

  private initPathPoints$(): BehaviorSubject<PathPoint[][]> {
    if (this.pathPoints$) return this.pathPoints$;
    if (this._track instanceof Track) {
      this.pathPoints$ = new BehaviorSubject<PathPoint[][]>([]);
      this.pathPointsSubscription = this._track.segments$.pipe(
        switchMap(segments => combineLatestSafe(segments.map(s => s.points$))),
        debounceTimeExtended(0, 100, 100),
        map(segments => segments.map(points => points.map(p =>({lat: p.pos.lat, lng: p.pos.lng, ele: p.ele})))),
      ).subscribe(points => this.pathPoints$!.next(points));
      return this.pathPoints$;
    }
    this.pathPoints$ = new BehaviorSubject<PathPoint[][]>([this._track.points]);
    return this.pathPoints$;
  }

  public get2DElements$(leaflet: L.Map, mapState: MapState, zoomAnim$: Observable<boolean>): Observable<LeafletElement<L.Polyline>[]> {
    const points$ = this.initPathPoints$();
    const pathElements$ = combineLatest([
      this.eleColors$,
      points$,
    ]).pipe(
      map(([eleColors, points]) => this.path2d.update(eleColors, points)),
    );
    const arrowsElements$ = combineLatest([points$, mapState.zoomInt$.pipe(switchMap(zoom => zoomAnim$.pipe(filter(anim => !anim), map(() => zoom))))]).pipe(
      switchMap(([points, zoom]) => Arrows.get2dElements(leaflet, points, zoom, this.arrowsColor$, this.eleColors$.pipe(map(ec => ec ? 3 : 2)))),
    );
    return combineLatest([pathElements$, arrowsElements$]).pipe(
      map(elements => elements.flat()),
    );
  }

  public get3DElements$(leaflet: L.Map, mapState: MapState, zoomAnim$: Observable<boolean>): ElementsFor3D {
    const points$ = this.initPathPoints$();
    const pathElements$ = combineLatest([
      this.eleColors$,
      points$,
    ]).pipe(
      map(([eleColors, points]) => this.path3d.update(eleColors, points)),
    );
    const arrowsElements$ = combineLatest([points$, mapState.zoomInt$.pipe(switchMap(zoom => zoomAnim$.pipe(filter(anim => !anim), map(() => zoom))))]).pipe(
      switchMap(([points, zoom]) => Arrows.get3dElements(leaflet, points, zoom, this.arrowsColor$, this.eleColors$.pipe(map(ec => ec ? 3 : 2)), this.id)),
    );
    return {
      elements2d$: of([]),
      elements3d$: combineLatest([pathElements$, arrowsElements$]).pipe(map(elements => elements.flat())),
    };
  }

  public get color(): string { return this.path2d.getColor(); }
  public set color(value: string) {
    if (this.color === value) return;
    this.path2d.setColor(value);
  }

  public get eleColors(): boolean { return this.eleColors$.value; }
  public set eleColors(value: boolean) {
    if (this.eleColors$.value === value) return;
    this.eleColors$.next(value);
  }

  public get arrowsColor(): string | undefined { return this.arrowsColor$.value; }
  public set arrowsColor(value: string | undefined) {
    if (value === this.arrowsColor$.value) return;
    this.arrowsColor$.next(value);
  }

}

type PathPoint = EarthPoint & { ele?: number; };

class Path2D {

  constructor(
    private color: string,
    private smoothFactor: number,
    private weight: number,
    private readonly fromTrack: any,
  ) {}

  private eleColors = false;
  private polylines?: LeafletElement<L.Polyline>[];
  private offset: EarthPoint = {lat: 0, lng: 0};

  getColor(): string {
    return this.color;
  }
  setColor(newColor: string): void {
    this.color = newColor;
    if (!this.eleColors && this.polylines) this.polylines[0].element.setStyle({color: this.color});
  }

  update(eleColors: boolean, points: PathPoint[][]): LeafletElement<L.Polyline>[] {
    console.log('update track', !!this.polylines, eleColors, this.eleColors);
    if (this.polylines === undefined || eleColors !== this.eleColors || eleColors) {
      this.eleColors = eleColors;
      this.polylines = this.buildPolyLines(points).map(element => ({element}));
    } else {
      let adjustedPoints: (L.LatLng | PathPoint)[][] = this.adjustPointsToAvoidGoingAroundEarth(points);
      if (this.offset.lat !== 0 || this.offset.lng !== 0)
        adjustedPoints = this.applyOffset(adjustedPoints, this.offset.lat, this.offset.lng) as any;
      this.polylines[0].element.setLatLngs(adjustedPoints);
      // TODO update arrows
    }
    return this.polylines;
  }

  private buildPolyLines(points: PathPoint[][]): L.Polyline[] {
    const polylines = this.eleColors ? this.buildPolyLinesWithEleColors(points) : [this.buildPolyLinesDefaultColor(points)];
    this.offset = {lat: 0, lng: 0};
    polylines.forEach(p => {
      p.on('click', e => {
        (e.originalEvent as any).fromTrack = this.fromTrack; // NOSONAR
      });
      p.on('add', () => {
        const el = p?.getElement();
        if (el) (el as any)._mapTrack = this.fromTrack;
      });
      let departure: PathPoint | undefined;
      for (const segment of points) {
        if (departure) break;
        if (segment.length > 0) {
          departure = segment[0];
          break;
        }
      }
      departure ??= {lat: 0, lng: 0}
      const adjustOffset = (map: L.Map) => {
        const offset = this.getOffsetForMap(map, departure);
        if (offset.lat !== this.offset.lat || offset.lng !== this.offset.lng) {
          p.setLatLngs(this.applyOffset(p.getLatLngs(), offset.lat - this.offset.lat, offset.lng - this.offset.lng));
          this.offset = offset;
        }
      };
      let map: L.Map | undefined;
      let mapListener: () => void | undefined;
      p.addEventListener('add', event => {
        map = event.target._map as L.Map;
        adjustOffset(map);
        const m = map;
        mapListener = () => { adjustOffset(m); };
        map.addEventListener('zoom', mapListener);
        map.addEventListener('move', mapListener);
      });
      p.addEventListener('remove', () => {
        map?.removeEventListener('zoom', mapListener);
        map?.removeEventListener('move', mapListener);
        map = undefined;
      });
    });
    return polylines;
  }

  private buildPolyLinesDefaultColor(points: PathPoint[][]): L.Polyline {
    points = this.adjustPointsToAvoidGoingAroundEarth(points);
    return L.polyline(points, {
      color: this.color,
      smoothFactor: this.smoothFactor,
      interactive: true,
      className: 'track-path',
      weight: this.weight,
    });
  }

  private buildPolyLinesWithEleColors(segments: PathPoint[][]): L.Polyline[] {
    segments = this.adjustPointsToAvoidGoingAroundEarth(segments);
    const polylines: {points: L.LatLngLiteral[], color: string, d: number, startEle: number | undefined}[] = [];
    for (const segment of segments) {
      let d = 0;
      let points: PathPoint[] = [];
      for (const point of segment) {
        const previous = points.at(-1);
        if (!previous) {
          d = 0;
          points = [point];
          continue;
        }
        if (points.length === 1) {
          const latestPl = polylines.at(-1);
          if (latestPl) {
            const d2 = latestPl.d + distance(point, latestPl.points.at(-1)!);
            if (point.ele === undefined && latestPl.startEle === undefined) {
              latestPl.points.push(point);
              latestPl.d = d2;
              points = [point];
              d = 0;
              continue;
            }
          }
        }
        d += distance(point, previous);
        points.push(point);
        if (d >= 25) {
          this.pushPoints(points, d, polylines);
          d = 0;
          points = [point];
        }
      }
      // end of segment
      this.pushPoints(points, d, polylines);
    }
    return this.createPolylinesWithBorders(polylines);
  }

  private pushPoints(points: PathPoint[], d: number, polylines: {points: L.LatLngLiteral[], color: string, d: number, startEle: number | undefined}[]) {
    let startEle: number | undefined;
    let endEle: number | undefined;
    for (const p of points) {
      if (p.ele !== undefined) {
        startEle ??= p.ele;
        endEle = p.ele;
      }
    }
    const color = startEle === undefined ? this.color : gradeColors[getGradeRange(d === 0 ? 0 : (endEle! - startEle) / d)];
    const latest = polylines.at(-1);
    if (latest?.color === color) {
      latest.points.push(...points);
      latest.d += d;
    } else {
      polylines.push({points, color, d, startEle});
    }
  }

  private createPolylinesWithBorders(polylines: {points: L.LatLngLiteral[], color: string, d: number, startEle: number | undefined}[]): L.Polyline[] {
    const result: L.Polyline[] = [];
    const bgColor = '#808080A0';
    const minWidth = 6;
    const borderWidth = 1;
    for (const pl of polylines) {
      result.push(L.polyline(pl.points, {
        color: bgColor,
        smoothFactor: this.smoothFactor,
        interactive: true,
        className: 'track-path',
        weight: Math.max(this.weight, minWidth),
      }));
    }
    for (const pl of polylines) {
      result.push(L.polyline(pl.points, {
        color: pl.color,
        smoothFactor: this.smoothFactor,
        interactive: true,
        className: 'track-path',
        weight: Math.max(this.weight, minWidth) - borderWidth * 2,
      }));
    }
    return result;
  }

  private getOffsetForMap(map: L.Map, departure: PathPoint): EarthPoint {
    const mapPoint = LeafletUtils.pointToMap(L.latLng(departure.lat, departure.lng), map);
    return {lat: mapPoint.lat - departure.lat, lng: mapPoint.lng - departure.lng};
  }

  private applyOffset(points: (L.LatLng | PathPoint)[] | (L.LatLng | PathPoint)[][] | (L.LatLng | PathPoint)[][][], latOffset: number, lngOffset: number): L.LatLng[] | L.LatLng[][] | L.LatLng[][][] {
    return points.map(p => {
      if (Array.isArray(p)) return this.applyOffset(p, latOffset, lngOffset);
      return L.latLng(p.lat + latOffset, p.lng + lngOffset);
    }) as any;
  }

  private adjustPointsToAvoidGoingAroundEarth(points: PathPoint[][]): PathPoint[][] {
    let previous: L.LatLngExpression | undefined = undefined;
    const result: PathPoint[][] = [];
    for (const segment of points) {
      const s: PathPoint[] = [];
      result.push(s);
      for (const point of segment) {
        if (previous === undefined) {
          previous = point;
          s.push(point);
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
        s.push(p);
        previous = p;
      }
    }
    return result;
  }

}

class Path3D {

  constructor(
    private readonly id: string,
    private color: string,
    private smoothFactor: number,
    private weight: number,
    private readonly fromTrack: any,
  ) {}

  private layer?: MapLibreElement;
  private eleColors = false;
  // TODO check if offset around the earth is needed

  update(eleColors: boolean, points: PathPoint[][]): MapLibreElement[] {
    if (this.layer === undefined || eleColors !== this.eleColors || eleColors) {
      this.eleColors = eleColors;
      this.layer = {
        id: this.id,
        type: 'line',
        source: this.buildSource(points),
        paint: {
          'line-color': this.color,
          'line-width': this.weight,
        }
      };
    } else {
      //let adjustedPoints: (L.LatLng | PathPoint)[][] = this.adjustPointsToAvoidGoingAroundEarth(points);
      //if (this.offset.lat !== 0 || this.offset.lng !== 0)
      //  adjustedPoints = this.applyOffset(adjustedPoints, this.offset.lat, this.offset.lng) as any;
      //this.polylines[0].setLatLngs(adjustedPoints);
      // TODO update
      // TODO update arrows
    }
    return [this.layer];
  }

  private buildSource(points: PathPoint[][]): SourceSpecification {
    return {
      type: 'geojson',
      data: this.buildSourceData(points)
    };
  }

  private buildSourceData(points: PathPoint[][]): GeoJSON.GeoJSON {
    return {
      type: 'Feature',
      geometry: this.buildGeoJSONFeatureGeometry(points),
      properties: {},
    }
  }

  private buildGeoJSONFeatureGeometry(points: PathPoint[][]): GeoJSON.LineString | GeoJSON.MultiLineString {
    if (points.length === 0) return { type: 'LineString', coordinates: [] };
    if (points.length === 1) return { type: 'LineString', coordinates: this.getCoordinates(points[0]) };
    return { type: 'MultiLineString', coordinates: points.map(segment => this.getCoordinates(segment)) };
  }

  private getCoordinates(segment: PathPoint[]): GeoJSON.Position[] {
    return segment.map(point => [point.lng, point.lat]);
  }

}

export const PATH_ARROWS_DEFAULT_COLOR = 'black';
const PATH_ARROWS_BORDER_COLOR = '#FFFFFF80';

class Arrows {

  public static get2dElements(leaflet: L.Map, points: PathPoint[][], zoom: number, color$: Observable<string | undefined>, weight$: Observable<number>): Observable<LeafletElement<L.Polyline>[]> {
    if (zoom < 10) return of([]);
    const allPoints = points.flat();
    if (allPoints.length < 3) return of([]);
    let arrows: LeafletElement<L.Polyline>[] = [];
    return combineLatest([color$, weight$]).pipe(
      map(([color, weight]) => {
        if (!color) {
          arrows = [];
          return arrows;
        };
        if (arrows.length === 0)
          arrows = this.buildArrows(leaflet, allPoints, zoom, color, weight).flatMap(
            arrow => [
              {
                element: L.polyline(arrow.border, {color: PATH_ARROWS_BORDER_COLOR, weight: weight + 3, className: 'track-arrow-border'})
              }, {
                element: L.polyline(arrow.arrow, {color, weight, className: 'track-arrow'})
              }
            ]
          );
        else
          arrows.forEach(a => {
            if (a.element.options.className !== 'track-arrow-border')
              a.element.setStyle({color, weight});
            else
              a.element.setStyle({weight});
          });
        return arrows;
      }),
    );
  }

  public static get3dElements(leaflet: L.Map, points: PathPoint[][], zoom: number, color$: Observable<string | undefined>, weight$: Observable<number>, idPrefix: string): Observable<MapLibreElement[]> {
    if (zoom < 10) return of([]);
    const allPoints = points.flat();
    if (allPoints.length < 3) return of([]);
    let arrows: MapLibreElement[] = [];
    return combineLatest([color$, weight$]).pipe(
      map(([color, weight]) => {
        if (!color) {
          arrows = [];
          return arrows;
        };
        if (arrows.length === 0) {
          const def = this.buildArrows(leaflet, allPoints, zoom, color, weight);
          arrows = [
            {
              id: idPrefix + '$arrowBorder',
              type: 'line',
              source: {
                type: 'geojson',
                data: {
                  type: 'Feature',
                  geometry: {
                    type: 'MultiLineString',
                    coordinates: def.map(arrow => arrow.border.map(pos => ([pos.lng, pos.lat]))),
                  },
                  properties: {},
                }
              },
              paint: {
                'line-color': PATH_ARROWS_BORDER_COLOR,
                'line-width': weight + 3,
              }
            }, {
              id: idPrefix + '$arrow',
              type: 'line',
              source: {
                type: 'geojson',
                data: {
                  type: 'Feature',
                  geometry: {
                    type: 'MultiLineString',
                    coordinates: def.map(arrow => arrow.arrow.map(pos => ([pos.lng, pos.lat]))),
                  },
                  properties: {},
                }
              },
              paint: {
                'line-color': color,
                'line-width': weight,
              }
            }
          ];
        } else {
          arrows.forEach(a => {
            // TODO
          });
        }
        return arrows;
      }),
    );
  }

  private static buildArrows(leaflet: L.Map, points: PathPoint[], zoom: number, color: string, weight: number): {arrow: L.LatLng[], border: L.LatLng[]}[] {
    const PIXELS_BETWEEN_ARROWS = zoom < 13 ? 25 : 50;
    const MINIMUM_PIXELS_BETWEEN_ARROWS = 10;
    const FIRST_ARROW_MINIMUM_PIXELS = 10;

    let lastArrow = this.toPointNotRounded(points[0], leaflet);
    const arrows: L.Point[] = [];
    const result: {arrow: L.LatLng[], border: L.LatLng[]}[] = [];
    for (let i = 1; i < points.length - 1; ++i) {
      const startPoint = points[i - 1];
      const endPoint = points[i];
      const middlePoint = {lat: startPoint.lat + (endPoint.lat - startPoint.lat) / 2, lng: startPoint.lng + (endPoint.lng - startPoint.lng) / 2};
      const p = this.toPointNotRounded(middlePoint, leaflet);
      const distance = p.distanceTo(lastArrow);
      if ((arrows.length === 0 && distance >= FIRST_ARROW_MINIMUM_PIXELS) ||
          (arrows.length > 0 && distance >= PIXELS_BETWEEN_ARROWS)) {
        // it is eligible => check if another arrow is too closed
        if (!this.isTooClosed(p, arrows, MINIMUM_PIXELS_BETWEEN_ARROWS)) {
          // it's ok !
          result.push({
            arrow: this.drawArrow(points, i, p, weight + 3, leaflet),
            border: this.drawArrow(points, i, p, weight + 3, leaflet),
          });
          arrows.push(p);
          lastArrow = p;
        }
      }
    }

    return result;
  }

  private static isTooClosed(pos: L.Point, arrows: L.Point[], min: number): boolean {
    for (const arrow of arrows) {
      if (pos.distanceTo(arrow) < min) {
        return true;
      }
    }
    return false;
  }

  private static drawArrow(points: PathPoint[], index: number, p: L.Point, d: number, map: L.Map): L.LatLng[] {
    let start = this.toPointNotRounded(points[index - 1], map);
    for (let i = 2; p.distanceTo(start) < 5 && index - i >= 0; ++i)
      start = this.toPointNotRounded(points[index - i], map);
    let end = this.toPointNotRounded(points[index], map);
    for (let i = 1; p.distanceTo(end) < 5 && index + i < points.length; ++i)
      end = this.toPointNotRounded(points[index + i], map);
    const a = Math.atan2(end.y - start.y, end.x - start.x);

    const a_left = a + Math.PI - Math.PI/6;
    const a_right = a + Math.PI + Math.PI/6;

    return [
      map.layerPointToLatLng([p.x + d * Math.cos(a_left), p.y + d * Math.sin(a_left)]),
      map.layerPointToLatLng([p.x, p.y]),
      map.layerPointToLatLng([p.x + d * Math.cos(a_right), p.y + d * Math.sin(a_right)])
    ];
  }

  private static toPointNotRounded(point: PathPoint, map: L.Map): L.Point {
    return map.project(point).subtract(map.getPixelOrigin());
  }

}
