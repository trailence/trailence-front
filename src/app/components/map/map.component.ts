import { ChangeDetectionStrategy, Component, EventEmitter, Injector, Input, Output, SimpleChanges } from '@angular/core';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { MapState } from './map-state';
import { Platform } from '@ionic/angular';
import { BehaviorSubject, Observable, Subscription, combineLatest, debounceTime, filter, first, mergeMap, takeWhile, timer } from 'rxjs';
import * as L from 'leaflet';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { DistanceUnit } from 'src/app/services/preferences/preferences';
import { MapTrack } from './track/map-track';
import { MapTrackPointReference } from './track/map-track-point-reference';
import { MapFitBoundsTool } from './tools/map-fit-bounds-tool';
import { Track } from 'src/app/model/track';
import { MapCursors } from './markers/map-cursors';
import { handleMapOffline } from './map-tiles-layer-offline';
import { MapLayer, MapLayersService } from 'src/app/services/map/map-layers.service';
import { NetworkService } from 'src/app/services/network/newtork.service';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';

const LOCALSTORAGE_KEY_MAPSTATE = 'trailence.map-state.';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: []
})
export class MapComponent extends AbstractComponent {

  @Input() mapId!: string;
  @Input() tracks$!: Observable<MapTrack[]>;

  @Output() mouseClickPoint = new EventEmitter<MapTrackPointReference | undefined>();
  @Output() mouseOverPoint = new EventEmitter<MapTrackPointReference | undefined>();

  public cursors = new MapCursors();

  id: string;
  private _mapState = new MapState();
  private _map$ = new BehaviorSubject<L.Map | undefined>(undefined);

  constructor(
    injector: Injector,
    private platform: Platform,
    private prefService: PreferencesService,
    private mapLayersService: MapLayersService,
  ) {
    super(injector);
    this.id = IdGenerator.generateId('map-');
  }

  protected override initComponent(): void {
    this.whenVisible.subscribe(this.platform.resize.pipe(debounceTime(500)), () => this._map$.value?.invalidateSize());
    this.visible$.subscribe(visible => {
      if (visible) {
        setTimeout(() => this._map$.value?.invalidateSize(), 0);
      }
      this._mapState.live = visible;
    });
    this.loadState();
    this.updateTracks();
    this._mapState.live$.pipe(
      filter(live => live),
      mergeMap(() => timer(50, 150).pipe(
        takeWhile(() => this._mapState.live),
        mergeMap(() => this.readyForMap$()),
        filter(ready => ready && this._mapState.live)
      )),
      first()
    ).subscribe(() => this.createMap());
    this.whenVisible.subscribe(
      combineLatest([this._mapState.center$, this._mapState.zoom$, this._mapState.tilesName$]).pipe(debounceTime(1000)),
      () => this._mapState.save(LOCALSTORAGE_KEY_MAPSTATE + this.mapId)
    );
  }

  override ngOnChanges(changes: SimpleChanges): void {
    if (changes['mapId']) this.loadState();
    if (changes['tracks$']) this.updateTracks();
  }

  protected override destroyComponent(): void {
    this._map$.value?.remove();
  }

  public pause() {
    this._mapState.live = false;
  }

  public resume() {
    this._mapState.live = true;
  }

  private loadState(): void {
    this._mapState.load(LOCALSTORAGE_KEY_MAPSTATE + this.mapId);
  }

  private mapChanged(map: L.Map): void {
    this._mapState.center = map.getCenter();
    this._mapState.zoom = map.getZoom();
  }

  private _currentTracks: MapTrack[] = [];
  private _tracksSubscription?: Subscription;
  private updateTracks(): void {
    this._tracksSubscription?.unsubscribe();
    this._tracksSubscription =
      combineLatest([this.tracks$, this._mapState.live$, this._map$]).subscribe(
      ([tracks, live, map]) => {
        if (!map || !live) return;
        const toRemove = [...this._currentTracks];
        tracks.forEach(track => {
          const index = toRemove.indexOf(track);
          if (index >= 0) {
            toRemove.splice(index, 1);
          } else {
            track.addTo(map);
          }
        });
        toRemove.forEach(track => track.remove());
        this._currentTracks = [...tracks];
        // if the state of the map is the initial one, zoom on the tracks
        if (tracks.length > 0 && this._mapState.center.lat === 0 && this._mapState.center.lng === 0 && this._mapState.zoom <= 2) {
          this.fitTracksBounds(map, tracks);
        }
      }
    );
  }

  private fitTracksBounds(map: L.Map, tracks: MapTrack[], padding: number = 0.05): void {
    let bounds;
    for (const t of tracks) {
      if (!bounds) {
        bounds = t.bounds;
      } else {
        const tb = t.bounds;
        if (tb) {
          bounds.extend(tb);
        }
      }
    }
    if (bounds) {
      bounds = bounds.pad(padding);
      map.fitBounds(bounds);
    }
  }

  public ensureVisible(track: MapTrack): void {
    const map = this._map$.value;
    if (!map) return;
    const bounds = track.bounds;
    if (bounds) {
      const mapBounds = map.getBounds();
      if (mapBounds.contains(bounds)) return;
      const newBounds = mapBounds.extend(bounds);
      map.flyToBounds(newBounds);
    }
  }


  private readyForMap$(): Observable<boolean> {
    return new Observable<boolean>(subscriber => {
      setTimeout(() => {
        const element = document.getElementById(this.id);
        const ready = !!element && element.clientHeight > 0 && element.clientWidth > 0;
        subscriber.next(ready);
        subscriber.complete();
      }, 0);
    });
  }

  public get tilesLayers(): {layer: MapLayer, tiles: L.TileLayer}[] {
    return this._tilesLayers || [];
  }

  public get crs(): L.CRS {
    return this._map$.value?.options.crs || L.CRS.EPSG3857;
  }

  private _tilesLayers?: {layer: MapLayer, tiles: L.TileLayer}[];

  private createMap(): void {
    this._tilesLayers = [];
    const layers: L.Control.LayersObject = {};
    for (const layer of this.mapLayersService.layers) {
      const tilesLayer = {layer, tiles: layer.create()};
      handleMapOffline(tilesLayer.layer.name, tilesLayer.tiles, this.injector.get(NetworkService), this.injector.get(OfflineMapService));
      this._tilesLayers.push(tilesLayer);
      layers[tilesLayer.layer.displayName] = tilesLayer.tiles;
    }
    let selectedLayer = this._tilesLayers.find(l => l.layer.name === this._mapState.tilesName);
    if (!selectedLayer) selectedLayer = this._tilesLayers.find(l => l.layer.name === this.mapLayersService.getDefaultLayer());
    if (!selectedLayer) selectedLayer = this._tilesLayers[0];

    const map = L.map(this.id, {
      center: this._mapState.center,
      zoom: this._mapState.zoom,
      layers: [selectedLayer.tiles],
    });

    L.control.layers(layers, {}).addTo(map);

    map.on('resize', () => this.mapChanged(map));
    map.on('move', e => {
      this.mapChanged(map);
      if ((e as any)['originalEvent']) {
        // action from user
        // TODO this.followingLocation = false;
      }
    });
    map.on('zoom', () => this.mapChanged(map));
    map.on('click', e => {
      if (this.mouseClickPoint.observed) {
        this.mouseClickPoint.emit(this.getEvent(map, e));
      }
    });
    map.on("mousemove", e => {
      if (this.mouseOverPoint.observed) {
        this.mouseOverPoint.emit(this.getEvent(map, e));
      }
    });

    new MapFitBoundsTool({position: 'topleft'}).addTo(map)
    map.on('fitTrackBounds', () => this.fitTracksBounds(map, this._currentTracks));

    this.cursors.addTo(map);

    this._map$.next(map);

    let distanceUnit: DistanceUnit | undefined = undefined;
    let scale: L.Control.Scale | undefined = undefined;
    this.whenAlive.add(
      combineLatest([this.prefService.preferences$, this._mapState.live$]).subscribe(
        ([prefs, live]) => {
          if (!live) return;
          if (distanceUnit !== prefs.distanceUnit && this._map$.value === map) {
            if (scale) scale.remove();
            scale = L.control.scale({
              metric: prefs.distanceUnit === 'METERS',
              imperial: prefs.distanceUnit === 'MILES',
            });
            distanceUnit = prefs.distanceUnit;
            scale.addTo(map);
          }
        }
      )
    );
  }

  private getEvent(map: L.Map, e: L.LeafletMouseEvent): MapTrackPointReference | undefined {
    const mouse = e.layerPoint;
    let closest: MapTrackPointReference | undefined = undefined;
    let closestDistance: number | undefined = undefined;
    for (const mapTrack of this._currentTracks) {
      if (!mapTrack.bounds?.pad(1).contains(e.latlng)) {
        continue;
      }
      const track = mapTrack.track;
      if (track instanceof Track) {
        for (let segmentIndex = 0; segmentIndex < track.segments.length; ++segmentIndex) {
          const segment = track.segments[segmentIndex];
          for (let pointIndex = 0; pointIndex < segment.points.length; ++pointIndex) {
            const pt = segment.points[pointIndex];
            const pixel = map.latLngToLayerPoint(pt.pos);
            const distance = mouse.distanceTo(pixel);
            if (distance < 15) {
              if (closestDistance === undefined || distance < closestDistance) {
                closestDistance = distance;
                closest = new MapTrackPointReference(mapTrack, segmentIndex, segment, pointIndex, pt);
              }
            }
          }
        }
      } else {
        for (let pointIndex = 0; pointIndex < track.points.length; ++pointIndex) {
          const pt = track.points[pointIndex];
          const pixel = map.latLngToLayerPoint(pt);
          const distance = mouse.distanceTo(pixel);
          if (distance < 15) {
            if (closestDistance === undefined || distance < closestDistance) {
              closestDistance = distance;
              closest = new MapTrackPointReference(mapTrack, undefined, undefined, pointIndex, pt);
            }
          }
        }
      }
    }
    return closest;
  }

}
