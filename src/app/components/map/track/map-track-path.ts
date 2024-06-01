import { Track } from 'src/app/model/track';
import * as L from 'leaflet';

export class MapTrackPath {

  constructor(
    private _track: Track,
    private _color: string,
    private _smoothFactor: number,
  ) {}

  private _path?: L.Polyline;

  public get path(): L.Polyline {
    if (!this._path) {
      const polylines: L.LatLng[][]  = [];
      for (const segment of this._track.segments) {
        const polyline: L.LatLng[] = [];
        polylines.push(polyline);
        for (const point of segment.points) {
          const pt = new L.LatLng(point.lat, point.lng);
          if (this._smoothFactor > 1 && point !== segment.points[0] && point !== segment.points[segment.points.length - 1] && pt.distanceTo(polyline[polyline.length - 1]) < 25)
            continue;
          polyline.push(pt);
        }
      }
      this._path = L.polyline(polylines, {
        color: this._color,
        smoothFactor: this._smoothFactor,
        interactive: false
      });
    }
    return this._path;
  }

  public addTo(map: L.Map): void {
    this.path.addTo(map);
  }

  public removeFrom(map: L.Map): void {
    if (!this._path) return;
    this._path.removeFrom(map);
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
