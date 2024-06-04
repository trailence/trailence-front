import { Track } from 'src/app/model/track';
import * as L from 'leaflet';
import { Subscription, combineLatest, map, mergeMap, of, skip } from 'rxjs';
import { Arrays } from 'src/app/utils/arrays';

export class MapTrackPath {

  constructor(
    private _track: Track,
    private _color: string,
    private _smoothFactor: number,
  ) {}

  private _map?: L.Map;
  private _path?: L.Polyline;
  private _subscription?: Subscription;

  public get path(): L.Polyline {
    if (!this._path) {
      const polylines: L.LatLng[][]  = [];
      for (const segment of this._track.segments) {
        const polyline: L.LatLng[] = [];
        polylines.push(polyline);
        let distanceFromPrevious = 0;
        let nb = segment.relativePoints.length;
        for (let i = 0; i < nb; ++i) {
          const relativePoint = segment.relativePoints[i];
          const point = relativePoint.point;
          const pt = new L.LatLng(point.lat, point.lng);
          distanceFromPrevious += relativePoint.distanceFromPreviousPoint;
          if (this._smoothFactor > 1 && i > 0 && i !== nb - 1 && distanceFromPrevious < 25)
            continue;
          polyline.push(pt);
          distanceFromPrevious = 0;
        }
      }
      this._path = L.polyline(polylines, {
        color: this._color,
        smoothFactor: this._smoothFactor,
        interactive: false
      });
      if (!this._subscription) {
        this._subscription = this._track.segments$.pipe(
          skip(1),
          mergeMap(segments => segments.length === 0 ? of([]) : combineLatest(segments.map(segment => segment.points$))),
          map(points => Arrays.flatMap(Arrays.flatMap(points, pts => pts), pt => [pt.lat$, pt.lng$])),
          mergeMap(changes$ => changes$.length === 0 ? of([]) : combineLatest(changes$)),
        ).subscribe(() => {
          if (this._path && this._map) this._path.removeFrom(this._map);
          this._path = undefined;
          if (this._map) this.path.addTo(this._map);
          // TODO check if we can do a more optimized way
          // at least for a recording track, we known that changes are only new points added at the end
        });
      }
    }
    return this._path;
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

  public get bounds(): L.LatLngBounds | undefined {
    const p = this.path;
    if (p.isEmpty()) {
      return undefined;
    }
    return p.getBounds();
  }

  public get color(): string { return this._color; }
  public set color(value: string) {
    if (value === this._color) return;
    this._color = value;
    if (this._path) this._path.setStyle({color: value});
  }

}
