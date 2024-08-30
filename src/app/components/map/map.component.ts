import { ChangeDetectionStrategy, Component, EventEmitter, Injector, Input, NgZone, Output, SimpleChanges } from '@angular/core';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { MapState } from './map-state';
import { Platform } from '@ionic/angular';
import { BehaviorSubject, Observable, Subscription, combineLatest, debounceTime, filter, first, map, switchMap, takeWhile, timer } from 'rxjs';
import * as L from 'leaflet';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { DistanceUnit } from 'src/app/services/preferences/preferences';
import { MapTrack } from './track/map-track';
import { MapTrackPointReference } from './track/map-track-point-reference';
import { MapFitBoundsTool } from './tools/map-fit-bounds-tool';
import { Track } from 'src/app/model/track';
import { MapCursors } from './markers/map-cursors';
import { MapLayersService } from 'src/app/services/map/map-layers.service';
import { MapCenterOnPositionTool } from './tools/center-on-location';
import { MapLayerSelectionTool } from './tools/layer-selection-tool';
import { ZoomLevelDisplayTool } from './tools/zoom-level-display';
import { DownloadMapTool } from './tools/download-map-tool';
import { DarkMapToggle } from './tools/dark-map-toggle';
import { CommonModule } from '@angular/common';

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

  @Output() mouseClickPoint = new EventEmitter<MapTrackPointReference[]>();
  @Output() mouseOverPoint = new EventEmitter<MapTrackPointReference[]>();
  @Output() mouseOver = new EventEmitter<L.LatLngLiteral>();
  @Output() mouseClick = new EventEmitter<L.LatLngLiteral>();

  public cursors = new MapCursors();
  public eventPixelMaxDistance = 15;

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
    this.whenVisible.subscribe(this.platform.resize.pipe(debounceTime(500)), () => this.invalidateSize());
    this.visible$.subscribe(visible => {
      if (visible) {
        setTimeout(() => this.invalidateSize(), 0);
      }
      this._mapState.live = visible;
    });
    this.loadState();
    this.updateTracks();
    this._mapState.live$.pipe(
      filter(live => live),
      switchMap(() => timer(100, 300).pipe(
        takeWhile(() => this._mapState.live),
        switchMap(() => this.readyForMap$()),
        filter(ready => ready && this._mapState.live)
      )),
      first()
    ).subscribe(() => this.createMap());
    this.whenVisible.subscribe(
      combineLatest([this._mapState.center$, this._mapState.zoom$, this._mapState.tilesName$]).pipe(debounceTime(1000)),
      () => this._mapState.save(LOCALSTORAGE_KEY_MAPSTATE + this.mapId)
    );
  }

  override onChangesBeforeCheckComponentState(changes: SimpleChanges): void {
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

  public invalidateSize(): void {
    if (this._mapState.live) {
      this._map$.value?.invalidateSize();
    }
  }

  public getState(): MapState {
    return this._mapState;
  }

  public getBounds(): L.LatLngBounds | undefined {
    return this._map$.value?.getBounds();
  }

  public goTo(lat: number, lng: number, zoom?: number) {
    this._map$.value?.setView({lat, lng}, zoom);
  }

  public get ready$(): Observable<boolean> {
    return this._map$.pipe(filter(m => !!m), first(), map(m => true));
  }

  public addToMap(element: L.Layer): void {
    element.addTo(this._map$.value!);
  }

  public removeFromMap(element: L.Layer): void {
    element.remove();
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

  public addTrack(track: MapTrack): void {
    if (this._map$.value)
      track.addTo(this._map$.value)
    this._currentTracks.push(track);
  }

  public removeTrack(track: MapTrack): void {
    track.remove();
    const index = this._currentTracks.indexOf(track);
    if (index >= 0)
      this._currentTracks.splice(index, 1);
  }

  public fitBounds(tracks: MapTrack[] | undefined): void {
    if (!this._map$.value) return;
    this.fitTracksBounds(this._map$.value, tracks || this._currentTracks);
  }

  public centerAndZoomOn(bounds: L.LatLngBounds): void {
    this._map$.value?.fitBounds(bounds);
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

  private _followingLocation$ = new BehaviorSubject<boolean>(false);
  private _locationMarker?: L.CircleMarker;
  private _toolCenterOnPosition?: L.Control;
  public showLocation(lat: number, lng: number, color: string): void {
    if (this._locationMarker) {
      this._locationMarker.setLatLng({lat, lng});
      this._locationMarker.setStyle({color, fillColor: color});
      const map = this._map$.value;
      if (map && this._followingLocation$.value) {
        let bounds = map.getBounds();
        const sw = map.latLngToContainerPoint(bounds.getSouthWest());
        const ne = map.latLngToContainerPoint(bounds.getNorthEast());
        ne.y += 40;
        sw.y -= 40;
        ne.x -= 65;
        sw.x += 65;
        bounds = L.latLngBounds(map.containerPointToLatLng(sw), map.containerPointToLatLng(ne));
        //L.rectangle(bounds).addTo(map);
        if (!bounds.contains(this._locationMarker.getLatLng())) {
          this.centerOnLocation();
        }
      }
    } else {
      this._locationMarker = new L.CircleMarker({lat, lng}, {
        radius: 7,
        color: color,
        opacity: 0.75,
        fillColor: color,
        fillOpacity: 0.33,
        stroke: true,
      });
      this._followingLocation$.next(true);
      if (this._map$.value) {
        this._locationMarker.addTo(this._map$.value);
        this._map$.value.setView(this._locationMarker.getLatLng(), Math.max(this._map$.value.getZoom(), 16));
        this._followingLocation$.next(true);
        if (!this._toolCenterOnPosition) {
          this.addToolCenterOnPosition(this._map$.value);
        }
      }
    }
  }

  public centerOnLocation(): void {
    if (this._map$.value && this._locationMarker) {
      this._map$.value.setView(this._locationMarker.getLatLng(), Math.max(this._map$.value.getZoom(), 16));
    }
    this._followingLocation$.next(true);
  }

  private toggleCenterOnLocation(): void {
    if (this._followingLocation$.value) {
      this._followingLocation$.next(false);
    } else {
      this.centerOnLocation();
    }
  }

  public hideLocation(): void {
    if (this._locationMarker) {
      if (this._map$.value) {
        this._locationMarker.removeFrom(this._map$.value);
      }
      this._locationMarker = undefined;
    }
    this._followingLocation$.next(false);
    if (this._toolCenterOnPosition) {
      this._toolCenterOnPosition.remove();
      this._toolCenterOnPosition = undefined;
    }
  }

  private addToolCenterOnPosition(map: L.Map): void {
    this._toolCenterOnPosition = new MapCenterOnPositionTool(this.injector, this._followingLocation$, { position: 'topleft' }).addTo(map);
  }

  private readyForMap$(): Observable<boolean> {
    return new Observable<boolean>(subscriber => {
      this.injector.get(NgZone).runOutsideAngular(() => {
        setTimeout(() => {
          const element = document.getElementById(this.id);
          const ready = !!element && element.clientHeight > 0 && element.clientWidth > 0;
          subscriber.next(ready);
          subscriber.complete();
        }, 0);
      });
    });
  }

  public get crs(): L.CRS {
    return this._map$.value?.options.crs || L.CRS.EPSG3857;
  }

  private createMap(): void {
    let layer = this.mapLayersService.layers.find(lay => lay.name === this._mapState.tilesName);
    if (!layer) layer = this.mapLayersService.layers.find(lay => lay.name === this.mapLayersService.getDefaultLayer());
    if (!layer) layer = this.mapLayersService.layers[0];

    const map = L.map(this.id, {
      center: this._mapState.center,
      zoom: this._mapState.zoom,
      layers: [layer.create()],
    });

    new ZoomLevelDisplayTool({position: 'topleft'}).addTo(map);
    new MapLayerSelectionTool(this.injector, this._mapState, {position: 'topright'}).addTo(map);
    new DarkMapToggle(this.injector, {position: 'topright'}).addTo(map);
    new DownloadMapTool(this.injector, {position: 'topright'}).addTo(map);

    map.on('resize', () => this.mapChanged(map));
    map.on('move', e => {
      this.mapChanged(map);
      if ((e as any)['originalEvent']) {
        // action from user
        this._followingLocation$.next(false);
      }
    });
    map.on('zoom', () => this.mapChanged(map));
    map.on('click', e => {
      if (this.mouseClickPoint.observed) {
        this.mouseClickPoint.emit(this.getEvent(map, e));
      }
      if (this.mouseClick.observed) {
        this.mouseClick.emit(e.latlng);
      }
    });
    map.on("mousemove", e => {
      if (this.mouseOverPoint.observed) {
        this.mouseOverPoint.emit(this.getEvent(map, e));
      }
      if (this.mouseOver.observed) {
        this.mouseOver.emit(e.latlng);
      }
    });

    new MapFitBoundsTool({position: 'topleft'}).addTo(map)
    map.on('fitTrackBounds', () => this.fitTracksBounds(map, this._currentTracks));

    this.cursors.addTo(map);

    if (this._locationMarker) {
      this._locationMarker.addTo(map);
      map.setView(this._locationMarker.getLatLng(), Math.max(map.getZoom(), 16));
      this.addToolCenterOnPosition(map);
    }
    map.on('centerOnLocation', () => this.toggleCenterOnLocation());

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

  private getEvent(map: L.Map, e: L.LeafletMouseEvent): MapTrackPointReference[] {
    const mouse = e.layerPoint;
    const result: MapTrackPointReference[] = [];
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
            if (distance <= this.eventPixelMaxDistance) {
              result.push(new MapTrackPointReference(mapTrack, segmentIndex, segment, pointIndex, pt, distance));
            }
          }
        }
      } else {
        for (let pointIndex = 0; pointIndex < track.points.length; ++pointIndex) {
          const pt = track.points[pointIndex];
          const pixel = map.latLngToLayerPoint(pt);
          const distance = mouse.distanceTo(pixel);
          if (distance <= this.eventPixelMaxDistance) {
            result.push(new MapTrackPointReference(mapTrack, undefined, undefined, pointIndex, pt, distance));
          }
        }
      }
    }
    return result;
  }

}
