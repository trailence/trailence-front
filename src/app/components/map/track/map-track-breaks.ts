import { MapAnchor } from '../markers/map-anchor';
import * as L from 'leaflet';

export const anchorBorderColor = '#b0865cD8';
export const anchorFillColor = '#C8986890';
export const anchorTextColor = '#ffffff';

export class MapTrackBreaks {

  private _anchors: MapAnchor[] = [];
  private _show = false;
  private _map?: L.Map;

  constructor(
  ) {}

  public addTo(map: L.Map): void {
    if (this._map) return;
    this._map = map;
    if (this._show) this.addToMap();
  }

  public remove(): void {
    if (!this._map) return;
    if (this._show) this.removeFromMap();
    this._map = undefined;
  }

  public show(show: boolean): void {
    if (this._show === show) return;
    this._show = show;
    if (this._map) {
      if (show) this.addToMap(); else this.removeFromMap();
    }
  }

  public reset(): void {
    if (this._show && this._map) this.removeFromMap();
    this._anchors = [];
  }

  public addBreakPoint(point: L.LatLngLiteral): void {
    const anchor = new MapAnchor(point, anchorBorderColor, '&#8987;', undefined, anchorTextColor, anchorFillColor);
    this._anchors.push(anchor);
    if (this._show && this._map) anchor.marker.addTo(this._map);
  }

  private addToMap(): void {
    for (const anchor of this._anchors) {
      anchor.marker.addTo(this._map!);
    }
  }

  private removeFromMap(): void {
    for (const anchor of this._anchors) {
      anchor.marker.removeFrom(this._map!);
    }
  }

}
