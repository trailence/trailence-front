import { Track } from '@trailence/model/track';
import { MAP_TRACKS_LAYER, MapElement } from '../map-element';
import { SimplifiedPoint, SimplifiedTrackSnapshot } from '@trailence/model/snapshots';
import { Trail } from '@trailence/model/trail';
import { BehaviorSubject, combineLatest, map, Observable, of, share, switchMap } from 'rxjs';
import { MapRenderer } from '../impl/map-renderer';
import { Color } from '@trailence/utils/color';
import { Polyline } from '../primitives/polyline';
import { combineLatestSafe } from '@trailence/utils/rxjs/combineLatestSafe';
import { debounceTimeExtended } from '@trailence/utils/rxjs/debounce-time-extended';
import { distance, EarthBBox, EarthPoint } from '@trailence/utils/latlng';
import { MapPrimitive } from '../primitives/primitive';
import { getGradeRange, gradeColors } from '@trailence/components/trail-graph/grade-values';
import { distance2d, Point2D } from '@trailence/utils/geometry-utils';

export class MapTrackPath extends MapElement {

  constructor(
    private readonly _trail: Trail | undefined,
    private readonly _track: Track | SimplifiedTrackSnapshot,
    color: Color,
    eleColors: boolean = false,
    weight: number = 3,
    arrowsColor: Color | undefined = undefined,
  ) {
    super('track-' + _track.uuid + '#' + _track.owner, {layer: MAP_TRACKS_LAYER});
    this._color = color;
    this._weight = weight;
    this._eleColors$ = new BehaviorSubject(eleColors);
    this._arrowsColor = arrowsColor;
    this._showArrows$ = new BehaviorSubject(arrowsColor !== undefined);
  }

  private _color: Color;
  private _weight: number;
  private readonly _eleColors$: BehaviorSubject<boolean>;
  private _arrowsColor: Color | undefined;
  private readonly _showArrows$: BehaviorSubject<boolean>;
  private _pathMonoColor: Polyline<any> | undefined;
  private _pathEleColors: undefined | PolylinesByElevation;
  private _arrows: Polyline<any>[] = [];

  public get color(): Color { return this._color; }
  public set color(value: Color) {
    if (Color.areSame(value, this._color)) return;
    if (this._pathMonoColor) {
      this._pathMonoColor.setOptions({
        color: value,
        width: this._weight,
        interactiveData: this,
      });
    }
  }

  public get eleColors(): boolean { return this._eleColors$.value; }
  public set eleColors(value: boolean) {
    if (value === this._eleColors$.value) return;
    this._eleColors$.next(value);
  }

  public get weight(): number { return this._weight; }
  public set weight(value: number) {
    if (value === this._weight) return;
    this._weight = value;
    // TODO update primitives
  }

  public get arrowsColor(): Color | undefined { return this._arrowsColor; }
  public set arrowsColor(value: Color | undefined) {
    if (value === undefined) {
      if (this._arrowsColor === undefined) return;
      this._arrowsColor = undefined;
      this._showArrows$.next(false);
      return;
    }
    if (this._arrowsColor === undefined) {
      this._arrowsColor = value;
      this._showArrows$.next(true);
      return;
    }
    if (Color.areSame(value, this._arrowsColor)) return;
    this._arrowsColor = value;
    if (this._arrows.length === 2) this._arrows[1].setOptions({
      color: value,
      width: this.weight,
      interactiveData: undefined,
    });
  }

  public get fitBounds(): EarthBBox | undefined {
    if (this._track instanceof Track) return this._track.metadata.bounds;
    return this.boundsFromSimplifiedPoints(this._track.points);
  }
  private boundsFromSimplifiedPoints(points: SimplifiedPoint[]): EarthBBox | undefined {
    let minlat, maxlat, minlng, maxlng;
    for (const pt of points) {
      if (minlat === undefined || pt.lat < minlat) minlat = pt.lat;
      if (maxlat === undefined || pt.lat > maxlat) maxlat = pt.lat;
      if (minlng === undefined || pt.lng < minlng) minlng = pt.lng;
      if (maxlng === undefined || pt.lng > maxlng) maxlng = pt.lng;
    }
    if (minlat === undefined) return undefined;
    return {minlat, maxlat: maxlat!, minlng: minlng!, maxlng: maxlng!};
  }

  protected override createPrimitives$(renderer: MapRenderer): Observable<MapPrimitive<any,any>[]> {
    const points$: Observable<EarthPoint[][]> = this._track instanceof Track ?
      this._track.segments$.pipe(
        switchMap(segments => combineLatestSafe(segments.map(s => s.points$))),
        debounceTimeExtended(0, 100, 100),
        map(segments => segments.map(points => points.map(p =>({lat: p.pos.lat, lng: p.pos.lng, ele: p.ele})))),
        share(),
      ) :
      of([this._track.points]);
    const path$ = combineLatest([
      points$,
      this._eleColors$,
    ]).pipe(
      map(([points, eleColors]) => {
        if (eleColors) {
          // TODO be able to update points ?
          this._pathEleColors = this.buildEleColors(renderer, points);
          return [this._pathEleColors.border, ...this._pathEleColors.byColor.map(p => p.polyline)];
        }
        if (this._pathMonoColor) this.updatePath(this._pathMonoColor, points);
        else this._pathMonoColor = this.buildPath(renderer, points);
        return [this._pathMonoColor];
      }),
    );
    const arrows$ = combineLatest([
      points$,
      renderer.mapState.zoom$.pipe(
        debounceTimeExtended(0, 250, 100),
      ),
      this._eleColors$.pipe(map(ec => ec ? 3 : 2)),
      this._showArrows$,
    ]).pipe(
      map(([points, zoom, weight, shown]) => {
        if (!shown) return [];
        this._arrows = Arrows.buildArrows(renderer, points, zoom, weight, this.id + '$arrow', this._arrowsColor!);
        return this._arrows;
      }),
    );
    return combineLatest([path$, arrows$]).pipe(map(elements => elements.flat()));
  }

  private buildPath(renderer: MapRenderer, points: EarthPoint[][]): Polyline<any> {
    return renderer.createPolyline(this.id, points, {
      color: this._color!,
      width: this._weight,
      interactiveData: this,
    });
  }

  private updatePath(path: Polyline<any>, points: EarthPoint[][]): void {
    path.setPositions(points);
  }

  private buildEleColors(renderer: MapRenderer, segments: EarthPoint[][]): PolylinesByElevation {
    const polylines: {points: EarthPoint[], color: Color, d: number, startEle: number | undefined}[] = [];
    for (const segment of segments) {
      let d = 0;
      let points: EarthPoint[] = [];
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
    return this.createPolylinesWithBorders(renderer, segments, polylines);
  }

  private pushPoints(points: EarthPoint[], d: number, polylines: {points: EarthPoint[], color: Color, d: number, startEle: number | undefined}[]) {
    let startEle: number | undefined;
    let endEle: number | undefined;
    for (const p of points) {
      if (p.ele !== undefined) {
        startEle ??= p.ele;
        endEle = p.ele;
      }
    }
    const color = startEle === undefined ? this.color : Color.parse(gradeColors[getGradeRange(d === 0 ? 0 : (endEle! - startEle) / d)]);
    const latest = polylines.at(-1);
    if (latest && Color.areSame(latest.color, color)) {
      latest.points.push(...points);
      latest.d += d;
    } else {
      polylines.push({points, color, d, startEle});
    }
  }

  private createPolylinesWithBorders(renderer: MapRenderer, allPoints: EarthPoint[][], polylines: {points: EarthPoint[], color: Color, d: number, startEle: number | undefined}[]): PolylinesByElevation {
    const minWidth = 6;
    const borderWidth = 1;
    const border = renderer.createPolyline(this.id, allPoints, {
      color: new Color(128, 128, 128, 0.63),
      width: Math.max(this.weight, minWidth),
      interactiveData: this,
    });
    const pointsByColor = new Map<Color, EarthPoint[][]>();
    for (const pl of polylines) {
      let color: Color | undefined;
      for (const c of pointsByColor.keys()) if (Color.areSame(c, pl.color)) { color = c; break; }
      let points: EarthPoint[][];
      if (color) points = pointsByColor.get(color)!;
      else {
        points = [];
        pointsByColor.set(pl.color, points);
      }
      points.push(pl.points);
    }
    const byColor: {color: Color, polyline: Polyline<any>}[] = [];
    for (const [color, points] of pointsByColor.entries()) {
      byColor.push({
        color,
        polyline: renderer.createPolyline(this.id, points, {
          color,
          width: Math.max(this.weight, minWidth) - borderWidth * 2,
          interactiveData: this,
        })
      });
    }
    return {byColor, border};
  }

}

interface PolylinesByElevation {
  byColor: {color: Color, polyline: Polyline<any>}[],
  border: Polyline<any>
}

export const PATH_ARROWS_DEFAULT_COLOR = new Color(0, 0, 0, 1);
const PATH_ARROWS_BORDER_COLOR = new Color(255, 255, 255, 0.5);

class Arrows {

  public static buildArrows(renderer: MapRenderer, points: EarthPoint[][], zoom: number, weight: number, idPrefix: string, color: Color): Polyline<any>[] {
    if (zoom < 10) return [];
    const allPoints = points.flat();
    if (allPoints.length < 3) return [];
    const arrows = this._buildArrows(renderer, allPoints, zoom, weight);
    return [
      renderer.createPolyline(idPrefix + '$border', arrows.map(a => a.border), {
        color: PATH_ARROWS_BORDER_COLOR,
        width: weight + 3,
        interactiveData: undefined,
      }),
      renderer.createPolyline(idPrefix, arrows.map(a => a.arrow), {
        color,
        width: weight,
        interactiveData: undefined,
      }),
    ];
  }

  private static _buildArrows(renderer: MapRenderer, points: EarthPoint[], zoom: number, weight: number): {arrow: EarthPoint[], border: EarthPoint[]}[] {
    const PIXELS_BETWEEN_ARROWS = zoom < 13 ? 25 : 50;
    const MINIMUM_PIXELS_BETWEEN_ARROWS = 10;
    const FIRST_ARROW_MINIMUM_PIXELS = 10;

    let lastArrow = renderer.projectToViewport(points[0]);
    const arrows: Point2D[] = [];
    const result: {arrow: EarthPoint[], border: EarthPoint[]}[] = [];
    for (let i = 1; i < points.length - 1; ++i) {
      const startPoint = points[i - 1];
      const endPoint = points[i];
      const middlePoint = {lat: startPoint.lat + (endPoint.lat - startPoint.lat) / 2, lng: startPoint.lng + (endPoint.lng - startPoint.lng) / 2};
      const p = renderer.projectToViewport(middlePoint);
      const distance = distance2d(p, lastArrow);
      if ((arrows.length === 0 && distance >= FIRST_ARROW_MINIMUM_PIXELS) ||
          (arrows.length > 0 && distance >= PIXELS_BETWEEN_ARROWS)) {
        // it is eligible => check if another arrow is too closed
        if (!this.isTooClosed(p, arrows, MINIMUM_PIXELS_BETWEEN_ARROWS)) {
          // it's ok !
          result.push({
            arrow: this.drawArrow(points, i, p, weight + 3, renderer),
            border: this.drawArrow(points, i, p, weight + 3, renderer),
          });
          arrows.push(p);
          lastArrow = p;
        }
      }
    }

    return result;
  }

  private static isTooClosed(pos: Point2D, arrows: Point2D[], min: number): boolean {
    for (const arrow of arrows) {
      if (distance2d(pos, arrow) < min) {
        return true;
      }
    }
    return false;
  }

  private static drawArrow(points: EarthPoint[], index: number, p: Point2D, d: number, renderer: MapRenderer): EarthPoint[] {
    let start = renderer.projectToViewport(points[index - 1]);
    for (let i = 2; distance2d(p, start) < 5 && index - i >= 0; ++i)
      start = renderer.projectToViewport(points[index - i]);
    let end = renderer.projectToViewport(points[index]);
    for (let i = 1; distance2d(p, end) < 5 && index + i < points.length; ++i)
      end = renderer.projectToViewport(points[index + i]);
    const a = Math.atan2(end.y - start.y, end.x - start.x);

    const a_left = a + Math.PI - Math.PI/6;
    const a_right = a + Math.PI + Math.PI/6;

    return [
      renderer.unprojectFromViewport({x: p.x + d * Math.cos(a_left), y: p.y + d * Math.sin(a_left)}),
      renderer.unprojectFromViewport(p),
      renderer.unprojectFromViewport({x: p.x + d * Math.cos(a_right), y: p.y + d * Math.sin(a_right)}),
    ];
  }

}
