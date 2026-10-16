import { LeafletUtils } from '@trailence/utils/leaflet-utils';
import * as L from 'leaflet';

export class MapCursors {

  private readonly _cursors: L.CircleMarker<any>[] = [];
  private _map?: L.Map;

  public get cursors(): L.CircleMarker<any>[] { return this._cursors; }

  public addTo(map: L.Map): void {
    if (this._map) return;
    this._map = map;
    for (const marker of this._cursors) {
      marker.setLatLng(LeafletUtils.pointToMap(marker.getLatLng(), map));
      marker.addTo(map);
    }
  }

  public addCursor(position: L.LatLngExpression): void {
    const pos = this._map ? LeafletUtils.pointToMap(L.latLng(position), this._map) : position;
    const marker = new L.CircleMarker(pos, { radius: 3, className: 'cursor' });
    (marker as any)._cursor_pos = position;
    this._cursors.push(marker);
    if (this._map) {
      marker.addTo(this._map);
      marker.bringToFront();
    }
  }

  public removeCursor(position: L.LatLngExpression): void {
    const pos = L.latLng(position);
    const index = this._cursors.findIndex(m => pos.equals((m as any)._cursor_pos));
    if (index < 0) return;
    const marker = this._cursors[index];
    this._cursors.splice(index, 1);
    if (this._map) marker.removeFrom(this._map);
  }

}
