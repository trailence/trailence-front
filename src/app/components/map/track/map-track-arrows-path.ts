import { Track } from 'src/app/model/track';
import { SimplifiedTrackSnapshot } from 'src/app/services/database/track-database';
import * as L from 'leaflet';

export class MapTrackArrowPath {

  constructor(
    private readonly _track: Track | SimplifiedTrackSnapshot,
  ) {}

  private _shown = false;
  private _map?: L.Map;
  private _arrowsByZoom: {[key:number]: L.Polyline[]} = {};
  private readonly _zoomStartHandler = () => {
    if (!this._shown) return;
    if (this._arrowsByZoom[this._currentZoomShown])
      for (const polyline of this._arrowsByZoom[this._currentZoomShown])
        polyline.removeFrom(this._map!); // NOSONAR
  };
  private readonly _zoomEndHandler = () => {
    if (!this._shown) return;
    let z = this._map!.getZoom();
    if (z < 10) z = -1
    if (z === this._currentZoomShown && z >= 0 && this._arrowsByZoom[this._currentZoomShown]) {
      for (const polyline of this._arrowsByZoom[this._currentZoomShown])
        polyline.addTo(this._map!); // NOSONAR
    } else {
      this.updateArrowsOnMap();
    }
  };
  private _currentZoomShown = -1;

  public addTo(map: L.Map): void {
    if (this._map) return;
    this._map = map;
    map.addEventListener('zoomstart', this._zoomStartHandler);
    map.addEventListener('zoomend', this._zoomEndHandler);
    this.updateArrowsOnMap();
  }

  public remove(): void {
    if (!this._map) return;
    this._map.removeEventListener('zoomstart', this._zoomStartHandler);
    this._map.removeEventListener('zoomend', this._zoomEndHandler);
    if (this._currentZoomShown >= 0)
      for (const polyline of this._arrowsByZoom[this._currentZoomShown])
        polyline.removeFrom(this._map);
    this._currentZoomShown = -1;
    this._map = undefined;
  }

  public show(show: boolean): void {
    if (this._shown === show) return;
    if (!show && this._currentZoomShown >= 0 && this._map)
      for (const polyline of this._arrowsByZoom[this._currentZoomShown])
        polyline.removeFrom(this._map);
    this._shown = show;
    if (show && this._map)
      this.updateArrowsOnMap();
  }

  private updateArrowsOnMap(): void {
    if (!this._shown || !this._map) return;
    let z = this._map.getZoom();
    if (z < 10) z = -1
    if (z === this._currentZoomShown) return;

    if (this._currentZoomShown >= 0)
      for (const polyline of this._arrowsByZoom[this._currentZoomShown])
        polyline.removeFrom(this._map);

    this._currentZoomShown = z;
    if (z < 0) return;

    if (!this._arrowsByZoom[z])
      this._arrowsByZoom[z] = this.createArrows(this._map);
    for (const polyline of this._arrowsByZoom[this._currentZoomShown])
      polyline.addTo(this._map);
  }

  private createArrows(map: L.Map): L.Polyline[] {
    let points: L.LatLngLiteral[];
    if (this._track instanceof Track)
      points = this._track.getAllPositions();
    else
      points = this._track.points;

    const result: L.Polyline[] = [];
    if (points.length < 3) return result;

    const PIXELS_BETWEEN_ARROWS = map.getZoom() < 13 ? 25 : 50;
    const MINIMUM_PIXELS_BETWEEN_ARROWS = 10;
    const FIRST_ARROW_MINIMUM_PIXELS = 10;

    let lastArrow = this.toPointNotRounded(points[0], map);
    const arrows: L.Point[] = [];
    for (let i = 1; i < points.length - 1; ++i) {
      const point = points[i];
      const p = this.toPointNotRounded(point, map);
      const distance = p.distanceTo(lastArrow);
      if ((arrows.length === 0 && distance >= FIRST_ARROW_MINIMUM_PIXELS) ||
          (arrows.length > 0 && distance >= PIXELS_BETWEEN_ARROWS)) {
        // it is eligible => check if another arrow is too closed
        if (!this.isTooClosed(p, arrows, MINIMUM_PIXELS_BETWEEN_ARROWS)) {
          // it's ok !
          result.push(
            this.drawArrow(points, i, p, 5, map)
            .setStyle({color: 'black', weight: 2, className: 'track-arrow'})
          );
          arrows.push(p);
          lastArrow = p;
        }
      }
    }

    return result;
  }

  private isTooClosed(pos: L.Point, arrows: L.Point[], min: number): boolean {
    for (const arrow of arrows) {
      if (pos.distanceTo(arrow) < min) {
        return true;
      }
    }
    return false;
  }

  private drawArrow(points: L.LatLngLiteral[], index: number, p: L.Point, d: number, map: L.Map): L.Polyline {
    let start = this.toPointNotRounded(points[index - 1], map);
    for (let i = 2; p.distanceTo(start) < 5 && index - i >= 0; ++i)
      start = this.toPointNotRounded(points[index - i], map);
    let end = this.toPointNotRounded(points[index + 1], map);
    for (let i = 2; p.distanceTo(end) < 5 && index + i < points.length; ++i)
      end = this.toPointNotRounded(points[index + i], map);
    const a = Math.atan2(end.y - start.y, end.x - start.x);

    const a_left = a + Math.PI - Math.PI/6;
    const a_right = a + Math.PI + Math.PI/6;

    return L.polyline([
      map.layerPointToLatLng([p.x + d * Math.cos(a_left), p.y + d * Math.sin(a_left)]),
      map.layerPointToLatLng([p.x, p.y]),
      map.layerPointToLatLng([p.x + d * Math.cos(a_right), p.y + d * Math.sin(a_right)])
    ]);
  }

  private toPointNotRounded(point: L.LatLngLiteral, map: L.Map): L.Point {
    return map.project(point).subtract(map.getPixelOrigin());
  }

  public bringToFront(): void {
    if (!this._shown || !this._map || this._currentZoomShown < 0) return;
    if (this._arrowsByZoom[this._currentZoomShown])
      this._arrowsByZoom[this._currentZoomShown].every(p => p.bringToFront());
  }

  public bringToBack(): void {
    if (!this._shown || !this._map || this._currentZoomShown < 0) return;
    if (this._arrowsByZoom[this._currentZoomShown])
      this._arrowsByZoom[this._currentZoomShown].every(p => p.bringToBack());
  }

}
