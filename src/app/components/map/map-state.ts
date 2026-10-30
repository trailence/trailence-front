import { BehaviorSubject, combineLatest, debounceTime, distinctUntilChanged, map, Observable, skip, Subscription } from 'rxjs';
import { MapAdditionsOptions } from '@trailence/services/map/map-additions.service';
import { EarthPoint } from '@trailence/utils/latlng';

const LOCALSTORAGE_KEY_MAPSTATE_PREFIX = 'trailence.map-state.';

export enum RotateMode {
  NORTH = 'north',
  HEADING = 'heading',
  DEVICE_ORIENTATION = 'device-orientation',
  CUSTOM = 'custom',
}

export class MapState {

  constructor(
    mapId?: string,
  ) {
    if (mapId) {
      this.load(mapId);
      this._subscription = combineLatest([
        this._center$,
        this._zoom$,
        this._tilesName$,
        this._overlays$,
        this._additions$,
        this._rotateMode$,
        this._bearing$,
        this._is3d$
      ]).pipe(
        skip(1),
        debounceTime(1000),
      ).subscribe(() => this.save(mapId));
    }
  }

  private readonly _subscription?: Subscription;

  public destroy(): void {
    this._subscription?.unsubscribe();
  }

  private readonly _center$ = new BehaviorSubject<EarthPoint>({lat: 0, lng: 0});
  private readonly _zoom$ = new BehaviorSubject<number>(2);
  private readonly _tilesName$ = new BehaviorSubject<string>('osm');
  private readonly _overlays$ = new BehaviorSubject<string[]>([]);
  private readonly _additions$ = new BehaviorSubject<MapAdditionsOptions>({});
  private readonly _rotateMode$ = new BehaviorSubject<RotateMode>(RotateMode.NORTH);
  private readonly _bearing$ = new BehaviorSubject<number>(0);
  private readonly _is3d$ = new BehaviorSubject<boolean>(false);

  public get center(): EarthPoint { return this._center$.value; }
  public get center$(): Observable<EarthPoint> { return this._center$; }
  public set center(value: EarthPoint) {
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

  public get is3d(): boolean { return this._is3d$.value; }
  public get is3d$(): Observable<boolean> { return this._is3d$; }
  public set is3d(value: boolean) { if (this._is3d$.value !== value) this._is3d$.next(value); }

  public get additions(): MapAdditionsOptions { return this._additions$.value; }
  public get additions$(): Observable<MapAdditionsOptions> { return this._additions$; }
  public set additions(value: MapAdditionsOptions) { this._additions$.next(value); }

  public get rotateMode(): RotateMode { return this._rotateMode$.value; }
  public get rotateMode$(): Observable<RotateMode> { return this._rotateMode$; }
  public set rotateMode(value: RotateMode) {
    if (value === this._rotateMode$.value) return;
    this._rotateMode$.next(value);
    if (value === RotateMode.NORTH) this.bearing = 0;
  }

  public get bearing(): number { return this._bearing$.value; }
  public get bearing$(): Observable<number> { return this._bearing$; }
  public set bearing(value: number) {
    if (value === this._bearing$.value) return;
    this._bearing$.next(value);
  }

  private load(mapId: string): void { // NOSONAR
    const stored = localStorage.getItem(LOCALSTORAGE_KEY_MAPSTATE_PREFIX + mapId);
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
      if (json['additions'] && typeof json['additions'] === 'object') {
        const additions = {} as MapAdditionsOptions;
        const aj = json['additions'];
        if (typeof aj['guidepost'] === 'boolean') additions.guidepost = aj['guidepost'];
        if (typeof aj['waterPoint'] === 'boolean') additions.waterPoint = aj['waterPoint'];
        if (typeof aj['toilets'] === 'boolean') additions.toilets = aj['toilets'];
        if (typeof aj['forbiddenWays'] === 'boolean') additions.forbiddenWays = aj['forbiddenWays'];
        if (typeof aj['permissiveWays'] === 'boolean') additions.permissiveWays = aj['permissiveWays'];
        this.additions = additions;
      }
      if (json['bearing'] && typeof json['bearing'] === 'number') this.bearing = json['bearing'];
      if (json['rotateMode'] && Object.values(RotateMode).includes(json['rotateMode'])) this.rotateMode = json['rotateMode'];
      if (json['is3d']) this.is3d = true;
    }
  }

  private save(mapId: string): void {
    localStorage.setItem(LOCALSTORAGE_KEY_MAPSTATE_PREFIX + mapId, JSON.stringify({
      center_lat: this.center.lat,
      center_lng: this.center.lng,
      zoom: this.zoom,
      tilesName: this.tilesName,
      overlays: this.overlays,
      additions: this.additions,
      rotateMode: this.rotateMode,
      bearing: this.bearing,
      is3d: this.is3d,
    }));
  }

}
