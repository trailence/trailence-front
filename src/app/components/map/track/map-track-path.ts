import { Track } from 'src/app/model/track';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { SimplifiedTrackSnapshot } from 'src/app/services/database/track-database';

export class MapTrackPath {

  constructor(
    private readonly _track: Track | SimplifiedTrackSnapshot,
    private _color: string,
    private readonly _smoothFactor: number,
    private readonly _weight: number = 3,
    private readonly fromTrack: any, // this will be the MapTrack, but any avoids circular reference
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
        interactive: true,
        className: 'track-path',
        weight: this._weight,
      });
      this._path.on('click', e => {
        (e.originalEvent as any).fromTrack = this.fromTrack; // NOSONAR
      });
      this._path.on('add', () => {
        const el = this._path?.getElement();
        if (el) (el as any)._mapTrack = this.fromTrack;
      });
      if (!this._subscription && this._track instanceof Track) {
        this._subscription = this._track.segmentChanges$.pipe(
          debounceTimeExtended(100, 100, 100),
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
      const nb = segment.points.length;
      for (let i = 0; i < nb; ++i) {
        const point = segment.points[i];
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
    this._color = value;
    if (this._path) this._path.setStyle({color: value});
  }

  public bringToFront(): void {
    if (this._map) this.path.bringToFront();
  }

  public bringToBack(): void {
    if (this._map) this.path.bringToBack();
  }

}
