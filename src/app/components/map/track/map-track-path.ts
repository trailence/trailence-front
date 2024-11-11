import { Track } from 'src/app/model/track';
import * as L from 'leaflet';
import { Subscription, combineLatest, debounceTime, map, of, skip, switchMap } from 'rxjs';
import { Arrays } from 'src/app/utils/arrays';
import { SimplifiedTrackSnapshot } from 'src/app/services/database/track-database';

export class MapTrackPath {

  constructor(
    private readonly _track: Track | SimplifiedTrackSnapshot,
    private _color: string,
    private readonly _smoothFactor: number,
  ) {}

  private _map?: L.Map;
  private _path?: L.Polyline;
  private _subscription?: Subscription;

  public get path(): L.Polyline {
    if (!this._path) {
      const polylines: L.LatLngExpression[][] = this._track instanceof Track ? this.buildPolyLines(this._track) : [this._track.points as L.LatLngLiteral[]];
      this._path = L.polyline(polylines, {
        color: this._color,
        smoothFactor: this._smoothFactor,
        interactive: false
      });
      if (!this._subscription && this._track instanceof Track) {
        this._subscription = this._track.segments$.pipe(
          switchMap(segments => segments.length === 0 ? of([]) : combineLatest(segments.map(segment => segment.points$))),
          map(points => Arrays.flatMap(points, pts => pts.map(pt => pt.pos$))),
          switchMap(changes$ => changes$.length === 0 ? of([]) : combineLatest(changes$)),
          skip(1),
          debounceTime(100),
        ).subscribe(() => {
          if (this._path && this._map) {
            this._path.setLatLngs(this.buildPolyLines(this._track as Track));
            return;
          }
          this._path = undefined;
          if (this._map) this.path.addTo(this._map);
        });
      }
    }
    return this._path;
  }

  private buildPolyLines(track: Track): L.LatLngExpression[][] {
    const polylines: L.LatLngExpression[][] = [];
    for (const segment of track.segments) {
      const polyline: L.LatLng[] = [];
      polylines.push(polyline);
      const nb = segment.relativePoints.length;
      for (let i = 0; i < nb; ++i) {
        const relativePoint = segment.relativePoints[i];
        const point = relativePoint.point;
        polyline.push(point.pos);
      }
    }
    return polylines;
  }

  public addTo(map: L.Map): void {
    if (this._map) return;
    this._map = map;
    this.path.addTo(map);
  }

  public remove(): void {
    this._subscription?.unsubscribe();
    this._subscription = undefined;
    if (this._map) {
      if (this._path) {
        this._path.removeFrom(this._map);
      }
    }
    this._map = undefined;
    this._path = undefined;
  }

  public getBounds(computeIfNoPath: boolean): L.LatLngBounds | undefined {
    if (!computeIfNoPath && !this._path) return undefined;
    const p = this.path;
    if (p.isEmpty()) {
      return undefined;
    }
    const b = p.getBounds();
    if (b.isValid())
      return b;
    return undefined;
  }

  public get color(): string { return this._color; }
  public set color(value: string) {
    if (value === this._color) return;
    this._color = value;
    if (this._path) this._path.setStyle({color: value});
  }

  public bringToFront(): void {
    if (this._map) this.path.bringToFront();
  }

}
