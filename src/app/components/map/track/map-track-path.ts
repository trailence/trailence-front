import { Track } from 'src/app/model/track';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { SimplifiedTrackSnapshot } from 'src/app/model/snapshots';
import { EventEmitter } from '@angular/core';
import { getGradeRange, gradeColors } from '../../trail-graph/grade-values';
import { distance } from 'src/app/utils/latlng';

export class MapTrackPath {

  constructor(
    private readonly _track: Track | SimplifiedTrackSnapshot,
    private _color: string,
    private readonly _smoothFactor: number,
    private readonly _weight: number = 3,
    private readonly fromTrack: any, // this will be the MapTrack, but any avoids circular reference
    private _eleColors: boolean = false,
  ) {}

  private _map?: L.Map;
  private _path?: L.Polyline[];
  private _subscription?: Subscription;
  private readonly _pathUpdated$ = new EventEmitter<any>();

  public get pathUpdated$() { return this._pathUpdated$; }

  public get path(): L.Polyline[] {
    if (!this._path) {
      this._path = this._eleColors ? this.buildPolyLinesWithEleColors(this._track) : this.buildPolyLinesDefaultColor(this._track);
      this._path.forEach(p => {
        p.on('click', e => {
          (e.originalEvent as any).fromTrack = this.fromTrack; // NOSONAR
        });
        p.on('add', () => {
          const el = p?.getElement();
          if (el) (el as any)._mapTrack = this.fromTrack;
        });
      });
      if (!this._subscription && this._track instanceof Track) {
        this._subscription = this._track.segmentChanges$.pipe(
          debounceTimeExtended(100, 100, 100),
        ).subscribe(() => {
          if (this._path && this._map && !this._eleColors) {
            this._path[0].setLatLngs((this._track as Track).getAllPositionsSegmented());
            this._pathUpdated$.emit();
            return;
          }
          this._path = undefined;
          const map = this._map;
          if (map) this.path.forEach(p => p.addTo(map)); // NOSONAR
        });
      }
    }
    return this._path;
  }

  private buildPolyLinesDefaultColor(track: Track | SimplifiedTrackSnapshot): L.Polyline[] {
    let points: L.LatLngExpression[][];
    if (track instanceof Track) {
      points = track.getAllPositionsSegmented();
    } else {
      points = [track.points as L.LatLngExpression[]];
    }
    return [L.polyline(points, {
      color: this._color,
      smoothFactor: this._smoothFactor,
      interactive: true,
      className: 'track-path',
      weight: this._weight,
    })];
  }

  private buildPolyLinesWithEleColors(track: Track | SimplifiedTrackSnapshot): L.Polyline[] {
    const segments: {lat: number, lng: number, ele?: number}[][] = track instanceof Track ?
      track.segments.map(s => s.points.map(p => ({lat: p.pos.lat, lng: p.pos.lng, ele: p.ele})))
      : [track.points];

    const polylines: {points: L.LatLngLiteral[], color: string, d: number, startEle: number | undefined}[] = [];
    for (const segment of segments) {
      let d = 0;
      let points: {lat: number, lng: number, ele?: number}[] = [];
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

    const result: L.Polyline[] = [];
    for (const pl of polylines) {
      result.push(L.polyline(pl.points, {
        color: this._color,
        smoothFactor: this._smoothFactor,
        interactive: true,
        className: 'track-path',
        weight: Math.max(this._weight, 4),
      }));
    }
    for (const pl of polylines) {
      result.push(L.polyline(pl.points, {
        color: pl.color,
        smoothFactor: this._smoothFactor,
        interactive: true,
        className: 'track-path',
        weight: Math.max(this._weight, 4) - 2,
      }));
    }
    return result;
  }

  private pushPoints(points: {lat: number, lng: number, ele?: number}[], d: number, polylines: {points: L.LatLngLiteral[], color: string, d: number, startEle: number | undefined}[]) {
    let startEle: number | undefined;
    let endEle: number | undefined;
    for (const p of points) {
      if (p.ele !== undefined) {
        startEle ??= p.ele;
        endEle = p.ele;
      }
    }
    const color = startEle === undefined ? this._color : gradeColors[getGradeRange(d === 0 ? 0 : (endEle! - startEle) / d)];
    const latest = polylines.at(-1);
    if (latest?.color === color) {
      latest.points.push(...points);
      latest.d += d;
    } else {
      polylines.push({points, color, d, startEle});
    }
  }

  public addTo(map: L.Map): void {
    if (this._map) return;
    this._map = map;
    this.path.forEach(p => p.addTo(map));
  }

  public remove(): void {
    this._subscription?.unsubscribe();
    this._subscription = undefined;
    if (this._map && this._path) {
      this._path.forEach(p => p.remove());
    }
    this._map = undefined;
    this._path = undefined;
  }

  public getBounds(computeIfNoPath: boolean): L.LatLngBounds | undefined {
    if (!computeIfNoPath && !this._path) return undefined;
    const polylines = this.path;
    let b: L.LatLngBounds | undefined = undefined;
    for (const path of polylines) {
      if (path.isEmpty()) continue;
      const pb = path.getBounds();
      if (!pb.isValid()) continue;
      if (b === undefined) b = pb;
      else b = b.extend(pb);
    }
    return b;
  }

  public get color(): string { return this._color; }
  public set color(value: string) {
    this._color = value;
    if (this._path && !this._eleColors) this._path[0].setStyle({color: value});
  }

  public get eleColors(): boolean { return this._eleColors; }
  public set eleColors(value: boolean) {
    if (this._eleColors === value) return;
    this._eleColors = value;
    if (this._path) {
      this._path.forEach(p => p.remove());
      this._path = undefined;
    }
    const map = this._map;
    if (map) this.path.forEach(p => p.addTo(map));
  }

  public bringToFront(): void {
    if (this._map) this.path.forEach(p => p.bringToFront());
  }

  public bringToBack(): void {
    if (this._map) this.path.forEach(p => p.bringToBack());
  }

}
