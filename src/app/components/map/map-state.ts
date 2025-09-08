import { BehaviorSubject, Observable } from 'rxjs';
import * as L from 'leaflet';

export class MapState {

  private readonly _live$ = new BehaviorSubject<boolean>(false);
  private readonly _center$ = new BehaviorSubject<L.LatLngLiteral>({lat: 0, lng: 0});
  private readonly _zoom$ = new BehaviorSubject<number>(2);
  private readonly _tilesName$ = new BehaviorSubject<string>('osm');
  private readonly _overlays$ = new BehaviorSubject<string[]>([]);

  public get live(): boolean { return this._live$.value; }
  public get live$(): Observable<boolean> { return this._live$; }
  public set live(value: boolean) { if (this._live$.value !== value) this._live$.next(value); }

  public get center(): L.LatLngLiteral { return this._center$.value; }
  public get center$(): Observable<L.LatLngLiteral> { return this._center$; }
  public set center(value: L.LatLngLiteral) {
    if (this._center$.value.lat !== value.lat && this._center$.value.lng !== value.lng)
      this._center$.next(value);
  }

  public get zoom(): number { return this._zoom$.value; }
  public get zoom$(): Observable<number> { return this._zoom$; }
  public set zoom(value: number) { if (this._zoom$.value !== value) this._zoom$.next(value); }

  public get tilesName(): string { return this._tilesName$.value; }
  public get tilesName$(): Observable<string> { return this._tilesName$; }
  public set tilesName(value: string) { if (this._tilesName$.value !== value) this._tilesName$.next(value); }

  public get overlays(): string[] { return this._overlays$.value; }
  public get overlays$(): Observable<string[]> { return this._overlays$; }
  public set overlays(value: string[]) { if (this._overlays$.value !== value) this._overlays$.next(value); }

  public load(key: string): void {
    const stored = localStorage.getItem(key);
    if (stored) {
      const json = JSON.parse(stored);
      if (typeof json['center_lat'] === 'number' && typeof json['center_lng'] === 'number')
        this.center = {lat: json['center_lat'], lng: json['center_lng']};
      if (typeof json['zoom'] === 'number')
        this.zoom = json['zoom'];
      if (typeof json['tilesName'] === 'string')
        this.tilesName = json['tilesName'];
      if (json['overlays'] && Array.isArray(json['overlays']))
        this.overlays = json['overlays'];
    }
  }

  public save(key: string): void {
    localStorage.setItem(key, JSON.stringify({
      center_lat: this.center.lat,
      center_lng: this.center.lng,
      zoom: this.zoom,
      tilesName: this.tilesName,
      overlays: this.overlays,
    }));
  }

}
