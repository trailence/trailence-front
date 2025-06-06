import * as L from 'leaflet';

export class MapCursors {

  private readonly _cursors: L.CircleMarker<any>[] = [];
  private _map?: L.Map;

  public get cursors(): L.CircleMarker<any>[] { return this._cursors; }

  public addTo(map: L.Map): void {
    if (this._map) return;
    this._map = map;
    this._cursors.forEach(marker => marker.addTo(map));
  }

  public addCursor(position: L.LatLngExpression): void {
    const marker = new L.CircleMarker(position, { radius: 3, className: 'cursor' });
    this._cursors.push(marker);
    if (this._map) {
      marker.addTo(this._map);
      marker.bringToFront();
    }
  }

  public removeCursor(position: L.LatLngExpression): void {
    const index = this._cursors.findIndex(m => m.getLatLng().equals(position));
    if (index < 0) return;
    const marker = this._cursors[index];
    this._cursors.splice(index, 1);
    if (this._map) marker.removeFrom(this._map);
  }

}
