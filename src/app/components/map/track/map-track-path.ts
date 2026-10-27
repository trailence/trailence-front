import { Track } from '@trailence/model/track';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';
import { debounceTimeExtended } from '@trailence/utils/rxjs/debounce-time-extended';
import { SimplifiedTrackSnapshot } from '@trailence/model/snapshots';
import { EventEmitter } from '@angular/core';
import { getGradeRange, gradeColors } from '../../trail-graph/grade-values';
import { distance, EarthPoint } from '@trailence/utils/latlng';
import { LeafletUtils } from '@trailence/utils/leaflet-utils';

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
  private _pathOffset: EarthPoint = {lat: 0, lng: 0};
  private _subscription?: Subscription;
  private readonly _pathUpdated$ = new EventEmitter<any>();

  public get pathUpdated$() { return this._pathUpdated$; }

  public get path(): L.Polyline[] {
    if (!this._path) {
      this._path = this._eleColors ? this.buildPolyLinesWithEleColors(this._track) : this.buildPolyLinesDefaultColor(this._track);
      this._pathOffset = {lat: 0, lng: 0};
      this._path.forEach(p => {
        p.on('click', e => {
          (e.originalEvent as any).fromTrack = this.fromTrack; // NOSONAR
        });
        p.on('add', () => {
          const el = p?.getElement();
          if (el) (el as any)._mapTrack = this.fromTrack;
        });
        const adjustOffset = (map: L.Map) => {
          const offset = this.getOffsetForMap(map);
          if (offset.lat !== this._pathOffset.lat || offset.lng !== this._pathOffset.lng) {
            p.setLatLngs(this.applyOffset(p.getLatLngs(), offset.lat - this._pathOffset.lat, offset.lng - this._pathOffset.lng));
            this._pathOffset = offset;
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
      if (!this._subscription && this._track instanceof Track) {
        this._subscription = this._track.segmentChanges$.pipe(
          debounceTimeExtended(100, 100, 100),
        ).subscribe(() => {
          if (this._path && this._map && !this._eleColors) {
            let points: any = this.adjustPointsToAvoidGoingAroundEarth((this._track as Track).getAllPositionsSegmented());
            if (this._pathOffset.lat !== 0 || this._pathOffset.lng !== 0)
              points = this.applyOffset(points, this._pathOffset.lat, this._pathOffset.lng);
            this._path[0].setLatLngs(points);
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

  private getOffsetForMap(map: L.Map): EarthPoint {
    if (this._track instanceof Track) {
      const departure = this._track.departurePoint;
      if (!departure) return {lat: 0, lng: 0};
      const mapPoint = LeafletUtils.pointToMap(departure.pos, map);
      return {lat: mapPoint.lat - departure.pos.lat, lng: mapPoint.lng - departure.pos.lng};
    }
    if (this._track.points.length === 0) return {lat: 0, lng: 0};
    const departure = this._track.points[0];
    const mapPoint = LeafletUtils.pointToMap(L.latLng(departure.lat, departure.lng), map);
    return {lat: mapPoint.lat - departure.lat, lng: mapPoint.lng - departure.lng};
  }

  private applyOffset(points: L.LatLng[] | L.LatLng[][] | L.LatLng[][][], latOffset: number, lngOffset: number): L.LatLng[] | L.LatLng[][] | L.LatLng[][][] {
    return points.map(p => {
      if (Array.isArray(p)) return this.applyOffset(p, latOffset, lngOffset);
      return L.latLng(p.lat + latOffset, p.lng + lngOffset);
    }) as any;
  }

  private adjustPointsToAvoidGoingAroundEarth(points: {lat: number, lng: number, ele?: number}[][]): {lat: number, lng: number, ele?: number}[][] {
    let previous: L.LatLngExpression | undefined = undefined;
    const result: {lat: number, lng: number, ele?: number}[][] = [];
    for (const segment of points) {
      const s: {lat: number, lng: number, ele?: number}[] = [];
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

  private buildPolyLinesDefaultColor(track: Track | SimplifiedTrackSnapshot): L.Polyline[] {
    let points: (L.LatLng | L.LatLngLiteral)[][];
    if (track instanceof Track) {
      points = track.getAllPositionsSegmented();
    } else {
      points = [track.points as L.LatLngLiteral[]];
    }
    points = this.adjustPointsToAvoidGoingAroundEarth(points);
    return [L.polyline(points, {
      color: this._color,
      smoothFactor: this._smoothFactor,
      interactive: true,
      className: 'track-path',
      weight: this._weight,
    })];
  }

  private buildPolyLinesWithEleColors(track: Track | SimplifiedTrackSnapshot): L.Polyline[] { // NOSONAR
    let segments: {lat: number, lng: number, ele?: number}[][] = track instanceof Track ?
      track.segments.map(s => s.points.map(p => ({lat: p.pos.lat, lng: p.pos.lng, ele: p.ele})))
      : [track.points];
    segments = this.adjustPointsToAvoidGoingAroundEarth(segments);

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
    return this.createPolylinesWithBorders(polylines);
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

  private createPolylinesWithBorders(polylines: {points: L.LatLngLiteral[], color: string, d: number, startEle: number | undefined}[]): L.Polyline[] {
    const result: L.Polyline[] = [];
    const bgColor = '#808080A0';
    const minWidth = 6;
    const borderWidth = 1;
    for (const pl of polylines) {
      result.push(L.polyline(pl.points, {
        color: bgColor,
        smoothFactor: this._smoothFactor,
        interactive: true,
        className: 'track-path',
        weight: Math.max(this._weight, minWidth),
      }));
    }
    for (const pl of polylines) {
      result.push(L.polyline(pl.points, {
        color: pl.color,
        smoothFactor: this._smoothFactor,
        interactive: true,
        className: 'track-path',
        weight: Math.max(this._weight, minWidth) - borderWidth * 2,
      }));
    }
    return result;
  }

  public addTo(map: L.Map): void {
    if (this._map) return;
    this._map = map;
    this.path.forEach(p => p.addTo(map));
    setTimeout(() => {
      const ml = (map as any)._mapLibre;
      if (ml) {
        const mapper = (pos: L.LatLng | L.LatLng[] | L.LatLng[][]): any => {
          if (Array.isArray(pos)) return pos.map(p => mapper(p));
          return [pos.lng, pos.lat];
        };
        //console.log('line', this.path[0].getLatLngs().map(mapper));
        /*
        ml.addSource('test', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'MultiLineString',
              coordinates: this.path[0].getLatLngs().map(mapper),
            }
          }
        });
        ml.addLayer({
          id: 'test',
          type: 'line',
          source: 'test',
          paint: {
            'line-color': '#FFFF00',
            'line-width': 5,
          }
        })*/
       /*
        ml.addLayer({
          id: 'test',
          type: 'line',
          source: {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: {
                type: 'MultiLineString',
                coordinates: this.path[0].getLatLngs().map(mapper),
              }
            }
          },
          paint: {
            'line-color': '#FFFF00',
            'line-width': 5,
          }
        });*/
      }
    }, 2000);
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
