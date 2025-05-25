import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Injector, Input, Output, QueryList, SimpleChanges, ViewChildren } from '@angular/core';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { MapState } from './map-state';
import { BehaviorSubject, Observable, Subscription, combineLatest, debounceTime, first, map, of, switchMap } from 'rxjs';
import L from 'leaflet';
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
import { DownloadMapTool } from './tools/download-map-tool';
import { DarkMapToggleTool } from './tools/dark-map-toggle';
import { MapGeolocationService } from 'src/app/services/map/map-geolocation.service';
import { MapShowPositionTool } from './tools/show-position-tool';
import { BrowserService } from 'src/app/services/browser/browser.service';
import { Trail } from 'src/app/model/trail';
import { MapBubble } from './bubble/map-bubble';
import { MapToggleBubblesTool } from './tools/toggle-bubbles-tool';
import { SimplifiedTrackSnapshot } from 'src/app/services/database/track-database';
import { Console } from 'src/app/utils/console';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { RestrictedWaysTool } from './tools/restricted-ways-tool';
import { PhoneLockTool } from './tools/phone-lock-tool';
import Trailence from 'src/app/services/trailence.service';
import { ToolbarComponent } from '../menus/toolbar/toolbar.component';
import { MenuItem } from '../menus/menu-item';
import { MapTool } from './tools/tool.interface';
import { ZoomInTool, ZoomLevelTool, ZoomOutTool } from './tools/zoom-tools';
import { MapAdditionsService } from 'src/app/services/map/map-additions.service';
import { GoBackTool } from './tools/go-back-tool';

const LOCALSTORAGE_KEY_MAPSTATE = 'trailence.map-state.';

@Component({
    selector: 'app-map',
    templateUrl: './map.component.html',
    styleUrls: ['./map.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
      ToolbarComponent,
    ]
})
export class MapComponent extends AbstractComponent {

  @Input() mapId!: string;
  @Input() tracks$!: Observable<MapTrack[]>;
  @Input() autoFollowLocation = false;
  @Input() downloadMapTrail?: Trail;
  @Input() bubbles$: Observable<MapBubble[]> = of([]);
  @Input() showBubbles$?: BehaviorSubject<boolean>;
  @Input() enableShowRestrictedWays = false;
  @Input() leftTools: MenuItem[] = [];
  @Input() rightTools: MenuItem[] = [];

  @Output() mouseClickPoint = new EventEmitter<MapTrackPointReference[]>();
  @Output() mouseOverPoint = new EventEmitter<MapTrackPointReference[]>();
  @Output() mouseOver = new EventEmitter<L.LatLngLiteral>();
  @Output() mouseClick = new EventEmitter<L.LatLngLiteral>();

  public cursors = new MapCursors();
  public eventPixelMaxDistance = 15;
  public isEmbedded = false;

  id: string;
  private readonly _mapState = new MapState();
  private readonly _map$ = new BehaviorSubject<L.Map | undefined>(undefined);

  @ViewChildren(ToolbarComponent) toolbars?: QueryList<ToolbarComponent>;

  constructor(
    injector: Injector,
    private readonly browser: BrowserService,
    private readonly prefService: PreferencesService,
    private readonly mapLayersService: MapLayersService,
    private readonly mapGeolocation: MapGeolocationService,
    private readonly mapAdditions: MapAdditionsService,
  ) {
    super(injector);
    this.id = IdGenerator.generateId('map-');
  }

  protected override initComponent(): void {
    this.mapLayersService.applyDarkMap(this.injector.get(ElementRef).nativeElement);
    this.whenVisible.subscribe(this.browser.resize$.pipe(debounceTime(500)), () => this.invalidateSize(), true);
    this.ngZone.runOutsideAngular(() => {
      this.visible$.subscribe(visible => {
        if (visible) {
          setTimeout(() => {
            if (!this._map$.value) this.initMap();
            else this.invalidateSize();
          }, 0);
        }
        this._mapState.live = visible;
      });
    });
    this.isEmbedded = false;
    let e = this.injector.get(ElementRef).nativeElement.parentElement;
    while (e) {
      if (e.nodeName.toUpperCase() === 'ION-MODAL') {
        this.isEmbedded = true;
        break;
      }
      e = e.parentElement;
    }
    if (!this.isEmbedded)
      this.loadState();
    this.updateTracks();
    this.updateBubbles();
    if (!this.isEmbedded) {
      this.whenVisible.subscribe(
        combineLatest([this._mapState.center$, this._mapState.zoom$, this._mapState.tilesName$]).pipe(debounceTime(1000)),
        () => this._mapState.save(LOCALSTORAGE_KEY_MAPSTATE + this.mapId),
        true
      );
      this.whenVisible.subscribe(
        combineLatest([this._mapState.center$, this._mapState.zoom$])
        .pipe(debounceTime(500)),
        ([center, zoom]) => {
          if (!this._mapState.live) return;
          this.mapAdditions.pushState(center, zoom);
          this.refreshTools();
          this.updateHashFromMap();
        }, true);
      this.whenVisible.subscribe(
        combineLatest([this._mapState.center$, this._mapState.zoom$]).pipe(
          switchMap(([c,z]) => this.browser.hash$.pipe(map(h => ([c,z,h] as [L.LatLngLiteral, number, Map<string,string>])))),
          debounceTime(750),
        ), ([c,z,hash]) => {
          if (!this._mapState.live) return;
          const h = this.browser.getHashes();
          if (h.has('zoom') && h.has('center') && c.lat === this._mapState.center.lat && c.lng === this._mapState.center.lng && z === this._mapState.zoom) {
            const currentZoom = '' + this._mapState.zoom;
            const currentCenter = '' + this._mapState.center.lat + ',' + this._mapState.center.lng;
            if (currentZoom !== h.get('zoom') || currentCenter !== h.get('center'))
              this.updateStateFromHash(h.get('zoom')!, h.get('center')!); // NOSONAR
          }
        }, true
      );
    }
    this.initTools();
  }

  private _initMapTimeout: any;
  private initMap(): void {
    this.ngZone.runOutsideAngular(() => {
      if (this._initMapTimeout) {
        clearTimeout(this._initMapTimeout);
        this._initMapTimeout = undefined;
      }
      if (!this.visible) return;
      if (document.getElementById(this.id)?.clientHeight) {
        this.createMap();
        return;
      }
      this._initMapTimeout = setTimeout(() => {
        this.initMap();
      }, 250);
    });
  }

  override onChangesBeforeCheckComponentState(changes: SimpleChanges): void {
    if (changes['mapId']) this.loadState();
    if (changes['tracks$']) this.updateTracks();
    if (changes['bubbles$']) this.updateBubbles();
    if (changes['rightTools'] || changes['leftTools']) this.updateTools();
  }

  protected override destroyComponent(): void {
    if (this._map$.value) {
      for (const track of this._currentTracks) {
        track.remove();
      }
      this._currentTracks = [];
      this._map$.value.remove();
      this._map$.next(undefined);
    }
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
    return this._map$.pipe(filterDefined(), first(), map(() => true));
  }

  public addToMap(element: L.Layer): void {
    this.ngZone.runOutsideAngular(() => element.addTo(this._map$.value!)); // NOSONAR
  }

  public removeFromMap(element: L.Layer): void {
    this.ngZone.runOutsideAngular(() => element.remove());
  }

  private loadState(): void {
    const hash = this.browser.decodeHash(window.location.hash);
    if (hash.has('zoom') && hash.has('center') && this.updateStateFromHash(hash.get('zoom')!, hash.get('center')!)) return;
    this._mapState.load(LOCALSTORAGE_KEY_MAPSTATE + this.mapId);
  }

  private updateHashFromMap(): void {
    const zoom = this._mapState.zoom;
    const center = this._mapState.center;
    Console.info('Update hash from map ' + this.mapId + ': ' + zoom + ',' + center.lat + ',' + center.lng);
    this.browser.setHashes(
      'zoom', '' + zoom,
      'center', '' + center.lat + ',' + center.lng,
    );
    const map = this._map$.value;
    if (map) {
      const bounds = map.getBounds();
      this.browser.setHash('bounds', '' + bounds.getSouth() + ',' + bounds.getEast() + ',' + bounds.getNorth() + ',' + bounds.getWest());
    }
  }

  private updateStateFromHash(zoom: string, center: string): boolean {
    try {
      const zoomValue = parseInt(zoom);
      const coords = center.split(',');
      const lat = parseFloat(coords[0]);
      const lng = parseFloat(coords[1]);
      if (!isNaN(zoomValue) && zoomValue >= 0 && zoomValue <= 19 && !isNaN(lat) && !isNaN(lng)) {
        if (this._mapState.zoom !== zoomValue || this._mapState.center.lat !== lat || this._mapState.center.lng !== lng) {
          Console.info('Update map ' + this.mapId + ' from hash: zoom from ' + this._mapState.zoom + ' to ' + zoomValue + ' and center from ' + this._mapState.center.lat + ',' + this._mapState.center.lng + ' to ' + lat + ',' + lng);
          if (this._map$.value) {
            this._map$.value.setView({lat, lng}, zoomValue);
          }
          this._mapState.zoom = zoomValue;
          this._mapState.center = {lat, lng};
        }
        return true;
      }
    } catch (e) { // NOSONAR
      // ignore
    }
    return false;
  }

  private mapChanged(map: L.Map): void {
    this._mapState.center = map.getCenter();
    this._mapState.zoom = map.getZoom();
  }

  private _currentTracks: MapTrack[] = [];
  private _tracksSubscription?: Subscription;
  private updateTracks(): void {
    this._tracksSubscription?.unsubscribe();
    this._tracksSubscription = this.ngZone.runOutsideAngular(() =>
      combineLatest([this.tracks$, this._mapState.live$, this._map$]).subscribe(
      ([tracks, live, map]) => {
        if (!map || !live) return;
        const toRemove = [...this._currentTracks];
        tracks.forEach(track => {
          const index = toRemove.indexOf(track);
          if (index >= 0) {
            toRemove.splice(index, 1);
            track.bringToFront();
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
    ));
  }

  private _currentBubbles: MapBubble[] = [];
  private _bubblesSubscription?: Subscription;
  private updateBubbles(): void {
    this._bubblesSubscription?.unsubscribe();
    this._bubblesSubscription = this.ngZone.runOutsideAngular(() =>
      combineLatest([this.bubbles$, this._mapState.live$, this._map$]).subscribe(
      ([bubbles, live, map]) => {
        if (!map || !live) return;
        const toRemove = [...this._currentBubbles];
        bubbles.forEach(bubble => {
          const index = toRemove.indexOf(bubble);
          if (index >= 0) {
            toRemove.splice(index, 1);
          } else {
            bubble.addTo(map);
          }
        });
        toRemove.forEach(bubble => bubble.remove());
        this._currentBubbles = [...bubbles];
        // if the state of the map is the initial one, zoom on the tracks
        if (bubbles.length > 0 && this._mapState.center.lat === 0 && this._mapState.center.lng === 0 && this._mapState.zoom <= 2) {
          this.fitTracksBubbles(map, bubbles);
        }
      }
    ));
  }

  public addTrack(track: MapTrack): void {
    this.ngZone.runOutsideAngular(() => {
      if (this._map$.value)
        track.addTo(this._map$.value);
      this._currentTracks.push(track);
    });
  }

  public removeTrack(track: MapTrack): void {
    this.ngZone.runOutsideAngular(() => {
      track.remove();
      const index = this._currentTracks.indexOf(track);
      if (index >= 0)
        this._currentTracks.splice(index, 1);
    });
  }

  public fitBounds(tracks: MapTrack[] | undefined): void {
    this.ngZone.runOutsideAngular(() => {
      if (!this._map$.value) return;
      this.fitTracksBounds(this._map$.value, tracks || this._currentTracks);
    });
  }

  public centerAndZoomOn(bounds: L.LatLngBounds): void {
    this.ngZone.runOutsideAngular(() => this._map$.value?.fitBounds(bounds));
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

  private fitTracksBubbles(map: L.Map, bubbles: MapBubble[], padding: number = 0.05): void {
    let bounds;
    for (const t of bubbles) {
      if (!bounds) {
        bounds = L.latLngBounds(t.center, t.center);
      } else {
        bounds.extend(t.center);
      }
    }
    if (bounds) {
      bounds = bounds.pad(padding);
      map.fitBounds(bounds);
    }
  }

  fitMapBounds(map: L.Map): void {
    let bounds;
    for (const t of this._currentTracks) {
      if (!bounds) {
        bounds = t.bounds;
      } else {
        const tb = t.bounds;
        if (tb) {
          bounds.extend(tb);
        }
      }
    }
    for (const t of this._currentBubbles) {
      if (!bounds) {
        bounds = L.latLngBounds(t.bounds.getSouthWest(), t.bounds.getNorthEast());
      } else {
        bounds.extend(L.latLngBounds(t.bounds.getSouthWest(), t.bounds.getNorthEast()));
      }
    }
    if (bounds) {
      bounds = bounds.pad(0.05);
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
      this.ngZone.runOutsideAngular(() => map.flyToBounds(newBounds));
    }
  }

  private readonly _followingLocation$ = new BehaviorSubject<boolean>(false);
  private _locationMarker?: L.CircleMarker;
  private showLocation(lat: number, lng: number, color: string): void {
    if (this.ngZone.runOutsideAngular(() => {
      if (this._locationMarker) {
        this.updateLocation(this._locationMarker, lat, lng, color);
        return false;
      }
      this._locationMarker = new L.CircleMarker({lat, lng}, {
        radius: 7,
        color: color,
        opacity: 0.75,
        fillColor: color,
        fillOpacity: 0.33,
        stroke: true,
        className: 'leaflet-position-marker',
      });
      if (this.autoFollowLocation && this.mapGeolocation.recorder.current)
        this._followingLocation$.next(true);
      if (this._map$.value) {
        this._locationMarker.addTo(this._map$.value);
        if (this._followingLocation$.value) {
          this._map$.value.setView(this._locationMarker.getLatLng(), Math.max(this._map$.value.getZoom(), 16));
        } else {
          this._map$.value.panInside(this._locationMarker.getLatLng(), {padding: [25,25]})
        }
      }
      return true;
    }))
      this.refreshTools();
  }

  private updateLocation(marker: L.CircleMarker, lat: number, lng: number, color: string): void {
    marker.setLatLng({lat, lng});
    marker.setStyle({color, fillColor: color});
    const map = this._map$.value;
    if (map && this._followingLocation$.value) {
      const bounds = this.getFollowLocationBounds(map);
      if (!bounds.contains(marker.getLatLng())) {
        this.centerOnLocation();
      }
    }
  }

  private getFollowLocationBounds(map: L.Map): L.LatLngBounds {
    let bounds = map.getBounds();
    const sw = map.latLngToContainerPoint(bounds.getSouthWest());
    const ne = map.latLngToContainerPoint(bounds.getNorthEast());
    ne.y += 40;
    sw.y -= 40;
    ne.x -= 65;
    sw.x += 65;
    if (sw.y - ne.y > 600) {
      ne.y += 120;
      sw.y -= 120;
    } else if (sw.y - ne.y > 400) {
      ne.y += 80;
      sw.y -= 80;
    } else if (sw.y - ne.y > 300) {
      ne.y += 60;
      sw.y -= 60;
    } else if (sw.y - ne.y > 200) {
      ne.y += 40;
      sw.y -= 40;
    }
    if (ne.x - sw.x > 600) {
      sw.x += 120;
      ne.x -= 120;
    } else if (ne.x - sw.x > 400) {
      sw.x += 80;
      ne.x -= 80;
    } else if (ne.x - sw.x > 300) {
      sw.x += 60;
      ne.x -= 60;
    } else if (ne.x - sw.x > 200) {
      sw.x += 40;
      ne.x -= 40;
    }
    return L.latLngBounds(map.containerPointToLatLng(sw), map.containerPointToLatLng(ne));
  }

  private centerOnLocation(): void {
    this.ngZone.runOutsideAngular(() => {
      if (this._map$.value && this._locationMarker) {
        this._map$.value.setView(this._locationMarker.getLatLng(), Math.max(this._map$.value.getZoom(), 16));
      }
      if (!this._followingLocation$.value)
        this._followingLocation$.next(true);
    });
  }

  toggleCenterOnLocation(): void {
    if (this._followingLocation$.value) {
      this._followingLocation$.next(false);
    } else {
      this.centerOnLocation();
    }
    this.refreshTools();
  }

  private hideLocation(): void {
    if (this.ngZone.runOutsideAngular(() => {
      if (this._locationMarker) {
        if (this._map$.value) {
          this._locationMarker.removeFrom(this._map$.value);
        }
        this._locationMarker = undefined;
        return true;
      }
      if (this._followingLocation$.value) {
        this._followingLocation$.next(false);
        return true;
      }
      return false;
    }))
      this.refreshTools();
  }

  public get crs(): L.CRS {
    return this._map$.value?.options.crs ?? L.CRS.EPSG3857;
  }

  private createMap(): void {
    const layer = this.mapLayersService.layers.find(lay => lay.name === this._mapState.tilesName)
      ?? this.mapLayersService.layers.find(lay => lay.name === this.mapLayersService.getDefaultLayer())
      ?? this.mapLayersService.layers[0];

    const map = L.map(this.id, {
      center: this._mapState.center,
      zoom: this._mapState.zoom,
      layers: [layer.create()],
      zoomControl: false,
    });

    map.on('resize', () => this.mapChanged(map));
    map.on('move', e => {
      this.mapChanged(map);
      if ((e as any)['originalEvent']) { // NOSONAR
        // action from user
        if (this._followingLocation$.value) {
          this._followingLocation$.next(false);
          this.refreshTools();
        }
      }
    });
    map.on('zoom', () => {
      this.mapChanged(map);
      this.refreshTools();
    });
    map.on('zoomend', () => {
      this.refreshTools();
    });
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
    map.on('zoomanim', e => this._mapState.zoom = e.zoom);

    this.cursors.addTo(map);

    if (this._locationMarker) {
      this._locationMarker.addTo(map);
      map.setView(this._locationMarker.getLatLng(), Math.max(map.getZoom(), 16));
    }

    this._map$.next(map);
    if (!this.isEmbedded)
      this.updateHashFromMap();

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
              imperial: prefs.distanceUnit === 'IMPERIAL',
            });
            distanceUnit = prefs.distanceUnit;
            scale.addTo(map);
          }
        }
      )
    );
    this.refreshTools();
  }

  private getEvent(map: L.Map, e: L.LeafletMouseEvent): MapTrackPointReference[] {
    const mouse = e.layerPoint;
    const result: MapTrackPointReference[] = [];
    const fromTrack = (e.originalEvent as any).fromTrack as MapTrack | undefined;
    if (fromTrack) {
      result.push(new MapTrackPointReference(fromTrack, undefined, undefined, undefined, undefined, undefined))
    }
    for (const mapTrack of this._currentTracks) {
      if (!mapTrack.bounds?.pad(1).contains(e.latlng)) {
        continue;
      }
      const track = mapTrack.track;
      if (track instanceof Track) {
        this.getEventTrack(track, map, mouse, mapTrack, result);
      } else {
        this.getEventSimplifiedTrack(track, map, mouse, mapTrack, result);
      }
    }
    return result;
  }

  private getEventTrack(track: Track, map: L.Map, mouse: L.Point, mapTrack: MapTrack, result: MapTrackPointReference[]): void {
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
  }

  private getEventSimplifiedTrack(track: SimplifiedTrackSnapshot, map: L.Map, mouse: L.Point, mapTrack: MapTrack, result: MapTrackPointReference[]): void {
    for (let pointIndex = 0; pointIndex < track.points.length; ++pointIndex) {
      const pt = track.points[pointIndex];
      const pixel = map.latLngToLayerPoint(pt);
      const distance = mouse.distanceTo(pixel);
      if (distance <= this.eventPixelMaxDistance) {
        result.push(new MapTrackPointReference(mapTrack, undefined, undefined, pointIndex, pt, distance));
      }
    }
  }

  private initTools(): void {
    if (this.showBubbles$) {
      this.defaultRightToolsItems.push(this.toMenuItem(new MapToggleBubblesTool(this.showBubbles$)));
      this.whenVisible.subscribe(this.showBubbles$, () => this.refreshTools(), true);
    }
    this.defaultRightToolsItems.push(new MenuItem());
    this.defaultRightToolsItems.push(this.toMenuItem(new DownloadMapTool(this.downloadMapTrail)));
    const phoneLockTool = new PhoneLockTool();
    this.defaultRightToolsItems.push(this.toMenuItem(phoneLockTool));
    if (this.enableShowRestrictedWays) {
      const tool = new RestrictedWaysTool(this.mapId);
      this.defaultRightToolsItems.push(this.toMenuItem(tool));
      this.whenVisible.subscribe(combineLatest([this._map$, this._mapState.center$, this._mapState.zoom$]), ([map, center, zoom]) => {
        tool.refresh(map, this.injector, () => this.refreshTools());
      });
    }

    const toolShowPosition = new MapShowPositionTool();
    this.defaultLeftToolsItems.push(new MenuItem());
    this.defaultLeftToolsItems.push(this.toMenuItem(toolShowPosition));
    this.defaultLeftToolsItems.push(this.toMenuItem(new MapCenterOnPositionTool(() => !!this._locationMarker, this._followingLocation$)));

    // handle recording and position
    this.whenAlive.add(
      combineLatest([
        this._mapState.live$,
        this.mapGeolocation.position$,
        this.mapGeolocation.recorder.current$,
        this.mapGeolocation.showPosition$,
      ]).subscribe(
        ([live, position, recording, showPosition]) => {
          if (!live) return;
          // show position tool only if not recording
          // show phone lock only if recording
          const positionToolWasVisible = toolShowPosition.visible;
          const positionToolWasActive = toolShowPosition.icon === 'pin-off';
          const phoneLockToolWasVisible = phoneLockTool.visible;
          if (recording) {
            toolShowPosition.visible = false;
            phoneLockTool.visible = phoneLockTool.available;
          } else {
            toolShowPosition.visible = true;
            toolShowPosition.icon = showPosition ? 'pin-off' : 'pin';
            phoneLockTool.visible = false;
          }
          // show position
          if (position) {
            this.showLocation(position.lat, position.lng, position.active ? '#2020FF' : '#555');
          } else {
            this.hideLocation();
          }
          if (toolShowPosition.visible !== positionToolWasVisible || (positionToolWasVisible && showPosition !== positionToolWasActive) || phoneLockTool.visible !== phoneLockToolWasVisible)
            this.refreshTools();
        }
      )
    );

    this.updateTools();

    Trailence.canKeepOnScreenLock({}).then(response => {
      if (response.allowed) {
        phoneLockTool.available = true;
        Trailence.getKeepOnScreenLock({}).then(response => {
          phoneLockTool.enabled = response.enabled;
          this.refreshTools();
        });
      }
    });
  }

  private updateTools(): void {
    this.leftToolsItems = [...this.defaultLeftToolsItems, ...this.leftTools];
    this.rightToolsItems = [...this.defaultRightToolsItems, ...this.rightTools];
  }

  private refreshTools(): void {
    this.toolbars?.forEach(tb => tb.refresh());
  }

  leftToolsItems: MenuItem[] = [];
  defaultLeftToolsItems: MenuItem[] = [
    this.toMenuItem(new ZoomInTool()),
    this.toMenuItem(new ZoomLevelTool()).setTextSize('11px'),
    this.toMenuItem(new ZoomOutTool()),
    new MenuItem(),
    this.toMenuItem(new MapFitBoundsTool()),
    new MenuItem(),
    this.toMenuItem(new GoBackTool()),
  ];
  rightToolsItems: MenuItem[] = [];
  defaultRightToolsItems: MenuItem[] = [
    this.toMenuItem(new MapLayerSelectionTool()),
    this.toMenuItem(new DarkMapToggleTool()),
  ];

  private toMenuItem(tool: MapTool): MenuItem {
    const item = new MenuItem()
      .setIcon(this.toMenuFunction(() => tool.icon, undefined))
      .setDisabled(this.toMenuFunction(() => tool.disabled, false))
      .setVisible(this.toMenuFunction(() => tool.visible, false))
      .setTextColor(this.toMenuFunction(() => tool.color, ''))
      .setBackgroundColor(this.toMenuFunction(() => tool.backgroundColor, ''))
      .setAction(tool.execute ? () => {
        const map = this._map$.value;
        if (!map) return;
        (tool.execute as (map: L.Map, mapComponent: MapComponent, injector: Injector) => Observable<any>)(map, this, this.injector).subscribe({
          complete: () => this.refreshTools(),
        });
      } : undefined)
      ;
    if (tool.i18n) item.setI18nLabel(this.toMenuFunction(() => tool.i18n!, ''));
    else if (tool.label) item.setFixedLabel(this.toMenuFunction(() => tool.label!, ''));
    return item;
  }

  private toMenuFunction<T>(
    getter: () => T | ((map: L.Map, mapComponent: MapComponent, injector: Injector) => T),
    defaultValue: T,
  ): () => T {
    return () => {
      const value = getter();
      if (typeof value === 'function') {
        const map = this._map$.value;
        if (!map) return defaultValue;
        return (value as (map: L.Map, mapComponent: MapComponent, injector: Injector) => T)(map, this, this.injector);
      }
      return value;
    };
  }

}
