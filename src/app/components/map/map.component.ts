import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Injector, Input, Output, QueryList, SimpleChanges, ViewChildren } from '@angular/core';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { MapState } from './map-state';
import { BehaviorSubject, Observable, Subscription, combineLatest, debounceTime, distinctUntilChanged, filter, first, map, of, switchMap, tap } from 'rxjs';
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
import { DownloadMapTool } from './tools/download-map-tool';
import { DarkMapToggleTool } from './tools/dark-map-toggle';
import { MapGeolocationService } from 'src/app/services/map/map-geolocation.service';
import { MapShowPositionTool } from './tools/show-position-tool';
import { BrowserService } from 'src/app/services/browser/browser.service';
import { Trail } from 'src/app/model/trail';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { PhoneLockTool } from './tools/phone-lock-tool';
import { ToolbarComponent } from '../menus/toolbar/toolbar.component';
import { combineMenuSources, MenuElement, MenuItem, MenuSeparator, MenuSource } from '../menus/menu-item';
import { MapToolContext } from './tools/tool.interface';
import { ZoomInTool, ZoomLevelTool, ZoomOutTool } from './tools/zoom-tools';
import { MapAdditionsService } from 'src/app/services/map/map-additions.service';
import { GoBackTool } from './tools/go-back-tool';
import { ScreenLockService } from 'src/app/services/screen-lock/screen-lock.service';
import { HttpService } from 'src/app/services/http/http.service';
import { Console } from 'src/app/utils/console';
import { SimplifiedTrackSnapshot } from 'src/app/model/snapshots';
import { AdditionsTool } from './tools/additions-tool';
import { BoundsBuilder } from 'src/app/utils/leaflet-utils';
import { MapElement } from './map-element';

const LOCALSTORAGE_KEY_MAPSTATE = 'trailence.map-state.';

const FOLLOW_LOCATION_DEFAULT_ZOOM = 16;
const FOLLOW_LOCATION_MIN_ZOOM = 13;

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
  @Input() elements$!: Observable<MapElement[]>;
  @Input() elementsFilter$?: Observable<(element: MapElement) => boolean>;
  @Input() autoFollowLocation = false;
  @Input() downloadMapTrail?: Trail;
  @Input() leftTools?: MenuSource;
  @Input() rightTools?: MenuSource;

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

  disableShowPosition$ = new BehaviorSubject<number>(0);

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
            if (this._map$.value) this.invalidateSize();
            else this.initMap();
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
      this._mapState.load(LOCALSTORAGE_KEY_MAPSTATE + this.mapId);
    this.updateElements();
    if (!this.isEmbedded) {
      this.whenVisible.subscribe(
        combineLatest([this._mapState.center$, this._mapState.zoomInt$, this._mapState.tilesName$, this._mapState.overlays$, this._mapState.additions$])
        .pipe(
          debounceTime(1000),
        ),
        ([center, zoom, layer, overlays]) => {
          if (!this._mapState.live) return;
          this.mapAdditions.pushState(center, zoom);
          this._mapState.save(LOCALSTORAGE_KEY_MAPSTATE + this.mapId);
        },
        true
      );
    }
    this.whenVisible.subscribe(combineLatest([this.toolsContext$, this._mapState.center$, this._mapState.zoomInt$]), ([context]) => {
      this.additionsTool.refresh(context);
    });
    // handle position
    this.whenAlive.add(
      combineLatest([
        this._mapState.live$,
        this.mapGeolocation.position$,
        this.disableShowPosition$,
      ]).subscribe(
        ([live, position, nbPosDisabled]) => {
          if (!live) return;
          // show position
          if (position && nbPosDisabled === 0) {
            this.showLocation(position.lat, position.lng, position.active ? '#2020FF' : '#555');
          } else {
            this.hideLocation();
          }
        }
      )
    );
    this.updateTools();
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
    if (changes['mapId']) this._mapState.load(LOCALSTORAGE_KEY_MAPSTATE + this.mapId);
    if (changes['elements$'] || changes['elementsFilter$']) this.updateElements();
    if (changes['rightTools'] || changes['leftTools']) this.updateTools();
  }

  protected override destroyComponent(): void {
    if (this._map$.value) {
      for (const element of this.currentElements$.value) {
        element.remove();
      }
      this.currentElements$.next([]);
      this._map$.value.remove();
      this._map$.next(undefined);
    }
  }

  public invalidateSize(): void {
    this.changesDetection.detectChanges(() => {
      if (this._mapState.live) {
        this._map$.value?.invalidateSize();
      }
    });
  }

  public getState(): MapState {
    return this._mapState;
  }

  public getMap() { return this._map$.value; }

  public getBounds(): L.LatLngBounds | undefined {
    return this._map$.value?.getBounds();
  }

  public goTo(lat: number, lng: number, zoom?: number): void {
    this._initZoomTimestamp = 1;
    this._map$.value?.setView({lat, lng}, zoom);
  }

  public goToBounds(north: number, south: number, east: number, west: number): void {
    this._initZoomTimestamp = 1;
    this._map$.value?.fitBounds([[south, west], [north, east]]);
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

  private mapChanged(map: L.Map): void {
    this._mapState.center = map.getCenter();
    this._mapState.zoom = map.getZoom();
  }

  private readonly currentElements$ = new BehaviorSubject<MapElement[]>([]);
  private _elementsSubscription?: Subscription;
  private updateElements(): void {
    this._elementsSubscription?.unsubscribe();
    this._elementsSubscription = this.ngZone.runOutsideAngular(() =>
      combineLatest([this.elements$, this.elementsFilter$ ?? of(() => true), this._mapState.live$, this._map$]).pipe(
        switchMap(r => this._zoomAnim$.pipe(
          filter(anim => !anim),
          map(() => r),
        )),
      )
      .subscribe(([elements, elementsFilter, live, map]) => {
        if (!map || !live) return;
        const toRemove = [...this.currentElements$.value];
        const displayed: MapElement[] = [];
        const highlighted: MapElement[] = [];
        for (const element of elements) {
          if (!elementsFilter(element)) continue;
          displayed.push(element);
          const index = toRemove.indexOf(element);
          if (index >= 0) {
            toRemove.splice(index, 1);
            element.bringToFront();
          } else {
            element.addTo(map);
          }
          if (element.highlighted) highlighted.push(element);
        }
        for (const element of toRemove) element.remove();
        for (const element of highlighted) element.bringToFront();
        this.currentElements$.next(displayed);
        this.initMapZoom(map);
      }
    ));
  }

  private _initZoomTimestamp?: number;
  private initMapZoom(map: L.Map): void {
    // if the state of the map is the initial one, zoom on the tracks
    if ((this._mapState.center.lat === 0 && this._mapState.center.lng === 0 && this._mapState.zoom <= 2) || // initial state
        (this._initZoomTimestamp && Date.now() - this._initZoomTimestamp < 2500)) {
      if (this.currentElements$.value.length > 0) {
        this.fitElementsBounds(map, this.currentElements$.value);
        this._initZoomTimestamp = Date.now();
      } else if (!this._initZoomTimestamp) {
        const init = Date.now();
        this._initZoomTimestamp = init;
        this.injector.get(HttpService).get('https://free.freeipapi.com/api/json')
        .subscribe((response: any) => {
          if (response && response['latitude'] && response['longitude'] && this._initZoomTimestamp === init && this.currentElements$.value.length === 0) { // NOSONAR
            Console.info('Move map to user position', response, this._initZoomTimestamp, this.currentElements$.value.length, this._mapState);
            this._map$.value?.setView({lat: response['latitude'], lng: response['longitude']}, 10);
          }
        });
      }
    }
  }

  public addElement(element: MapElement): void {
    this.ngZone.runOutsideAngular(() => {
      if (this._map$.value)
        element.addTo(this._map$.value);
      this.currentElements$.value.push(element);
      this.currentElements$.next(this.currentElements$.value);
    });
  }

  public removeElement(element: MapElement): void {
    this.ngZone.runOutsideAngular(() => {
      element.remove();
      const index = this.currentElements$.value.indexOf(element);
      if (index >= 0) {
        this.currentElements$.value.splice(index, 1);
        this.currentElements$.next(this.currentElements$.value);
      }
    });
  }

  public fitBounds(elements: MapElement[] | undefined): void {
    this.ngZone.runOutsideAngular(() => {
      if (!this._map$.value) return;
      this.fitElementsBounds(this._map$.value, elements || this.currentElements$.value);
      this._initZoomTimestamp = 1;
    });
  }

  public centerAndZoomOn(bounds: L.LatLngBounds): void {
    this.ngZone.runOutsideAngular(() => this._map$.value?.fitBounds(bounds));
  }

  public zoomed(): void {
    this._initZoomTimestamp = 1;
  }

  private fitElementsBounds(map: L.Map, elements: MapElement[], padding: number = 0.05): void {
    const boundsBuilder = new BoundsBuilder();
    for (const e of elements) boundsBuilder.extend(e.bounds);
    boundsBuilder.pad(padding);
    this.fit(map, boundsBuilder);
  }

  private fit(map: L.Map, boundsBuilder: BoundsBuilder) {
    const bounds = boundsBuilder.getBounds();
    if (bounds) {
      map.fitBounds(bounds);
      this._initZoomTimestamp = 1;
    }
  }

  private readonly fitBoundsProviders$ = new BehaviorSubject<(() => L.LatLngBounds | undefined)[]>([]);
  public addFitBoundsProvider(provider: () => L.LatLngBounds | undefined): void {
    if (!this.fitBoundsProviders$.value.includes(provider)) {
      this.fitBoundsProviders$.value.push(provider);
      this.fitBoundsProviders$.next(this.fitBoundsProviders$.value);
    }
  }
  public removeFitBoundsProvider(provider: () => L.LatLngBounds | undefined): void {
    const index = this.fitBoundsProviders$.value.indexOf(provider);
    if (index >= 0) {
      this.fitBoundsProviders$.value.splice(index, 1);
      this.fitBoundsProviders$.next(this.fitBoundsProviders$.value);
    }
  }

  fitMapBounds(map: L.Map): void {
    const boundsBuilder = new BoundsBuilder();
    for (const e of this.currentElements$.value) {
      const b = e.bounds;
      if (b) boundsBuilder.extend(L.latLngBounds(b.getSouthWest(), b.getNorthEast()));
    }
    for (const provider of this.fitBoundsProviders$.value) boundsBuilder.extend(provider());
    boundsBuilder.pad(0.05);
    this.fit(map, boundsBuilder);
  }

  public canFitMapBounds$(): Observable<boolean> {
    return this.currentElements$.pipe(
      switchMap(elements => {
        if (elements.length > 0) return of(true);
        return this.fitBoundsProviders$.pipe(
          map(providers => providers.some(p => p() !== undefined)),
        );
      }),
      distinctUntilChanged(),
    );
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
      this._initZoomTimestamp = 1;
    }
  }

  public ensurePointVisible(pos: L.LatLngExpression): void {
    const map = this._map$.value;
    if (!map) return;
    this.ngZone.runOutsideAngular(() => map.panInside(pos, {padding: [75, 75]}));
  }

  private readonly _followingLocation$ = new BehaviorSubject<boolean>(false);
  private readonly locationMarker$ = new BehaviorSubject<L.CircleMarker | undefined>(undefined);
  private showLocation(lat: number, lng: number, color: string): void {
    this.ngZone.runOutsideAngular(() => {
      if (this.locationMarker$.value) {
        this.updateLocation(this.locationMarker$.value, lat, lng, color);
        return;
      }
      const marker = new L.CircleMarker({lat, lng}, {
        radius: 7,
        color: color,
        opacity: 0.75,
        fillColor: color,
        fillOpacity: 0.33,
        stroke: true,
        className: 'leaflet-position-marker',
        pane: 'markerPane',
      });
      marker.on('add', () => {
        (marker as any)._renderer?._container?.classList?.add('position-circle-marker');
      });
      this.locationMarker$.next(marker);
      if (this.autoFollowLocation && this.mapGeolocation.recorder.current)
        this._followingLocation$.next(true);
      if (this._map$.value) {
        this._initZoomTimestamp = 1;
        marker.addTo(this._map$.value);
        if (this._followingLocation$.value) {
          this._map$.value.setView(marker.getLatLng(), Math.max(this._map$.value.getZoom(), FOLLOW_LOCATION_DEFAULT_ZOOM));
        } else {
          this._map$.value.panInside(marker.getLatLng(), {padding: [25,25]})
        }
      }
    });
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
    // apply insets for visible part (toolbars...)
    ne.y += 57;
    sw.y -= 30;
    ne.x -= 47;
    sw.x += 47;
    // reduce to 40%
    const percent = 0.6;
    const width = ne.x - sw.x;
    sw.x += Math.round(width * percent * 0.5);
    ne.x -= Math.round(width * percent * 0.5);
    const height = sw.y - ne.y;
    ne.y += Math.round(height * percent * 0.5);
    sw.y -= Math.round(height * percent * 0.5);
    return L.latLngBounds(map.containerPointToLatLng(sw), map.containerPointToLatLng(ne));
  }

  private centerOnLocation(): void {
    this.ngZone.runOutsideAngular(() => {
      if (this._map$.value && this.locationMarker$.value) {
        this._map$.value.setView(this.locationMarker$.value.getLatLng(), Math.max(this._map$.value.getZoom(), FOLLOW_LOCATION_MIN_ZOOM));
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
  }

  private hideLocation(): void {
    this.ngZone.runOutsideAngular(() => {
      if (this.locationMarker$.value) {
        if (this._map$.value) {
          this.locationMarker$.value.removeFrom(this._map$.value);
        }
        this.locationMarker$.next(undefined);
      } else if (this._followingLocation$.value) {
        this._followingLocation$.next(false);
      }
    });
  }

  public get crs(): L.CRS {
    return this._map$.value?.options.crs ?? L.CRS.EPSG3857;
  }

  private readonly _zoomAnim$ = new BehaviorSubject<boolean>(false);
  private createMap(): void {
    const layer = this.mapLayersService.layers.find(lay => lay.name === this._mapState.tilesName)
      ?? this.mapLayersService.layers.find(lay => lay.name === this.mapLayersService.getDefaultLayer())
      ?? this.mapLayersService.layers[0];
    const overlays = this._mapState.overlays.map(name => this.mapLayersService.overlays.find(o => o.name === name)).filter(o => !!o);

    const map = L.map(this.id, { //NOSONAR
      center: this._mapState.center,
      zoom: this._mapState.zoom,
      layers: [layer.create(), ...overlays.map(o => o.create())],
      zoomControl: false,
      worldCopyJump: true,
      //zoomSnap: 0.5,
      //zoomDelta: 0.5,
    });
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank">Leaflet</a>');
    map.createPane('overTracksPane').style.zIndex = '401';
    map.createPane('overAllPane').style.zIndex = '499';

    map.on('resize', () => this.mapChanged(map));
    map.on('move', e => {
      this.mapChanged(map);
      if ((e as any)['originalEvent']) { // NOSONAR
        // action from user
        this._initZoomTimestamp = 1;
        if (this._followingLocation$.value) {
          if (this.locationMarker$.value && !this.getFollowLocationBounds(map).contains(this.locationMarker$.value.getLatLng())) {
            this._followingLocation$.next(false);
          }
        }
      }
    });
    map.on('zoom', () => {
      this.mapChanged(map);
    });
    map.on('zoomstart', () => {
      this._zoomAnim$.next(true);
    });
    map.on('zoomend', () => {
      this._zoomAnim$.next(false);
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
    map.on('zoomanim', e => {
      this._mapState.zoom = e.zoom;
    });

    this.cursors.addTo(map);

    if (this.locationMarker$.value) {
      this.locationMarker$.value.addTo(map);
      map.setView(this.locationMarker$.value.getLatLng(), Math.max(map.getZoom(), 16));
    }

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
              imperial: prefs.distanceUnit === 'IMPERIAL',
            });
            distanceUnit = prefs.distanceUnit;
            scale.addTo(map);
          }
        }
      )
    );

    //L.rectangle(this.getFollowLocationBounds(map), {color: 'yellow'}).addTo(map);
  }

  private getEvent(map: L.Map, e: L.LeafletMouseEvent): MapTrackPointReference[] { // NOSONAR
    const mouse = e.layerPoint;
    const result: MapTrackPointReference[] = [];
    const fromTrack = (e.originalEvent as any).fromTrack as MapTrack | undefined;
    if (fromTrack) {
      result.push(new MapTrackPointReference(fromTrack, undefined, undefined, undefined, undefined, undefined))
    }
    const allTracks = this.currentElements$.value.filter(e => e instanceof MapTrack);
    const overlay = map.getPanes().overlayPane.firstElementChild?.firstElementChild; // svg > g > path
    if (overlay) {
      for (let i = 0; i < overlay.children.length; ++i) {
        const o = overlay.children.item(i);
        if ((o as any)?._mapTrack) {
          const mt = (o as any)._mapTrack;
          if (!allTracks.includes(mt)) allTracks.push(mt);
        }
      }
    }
    for (const mapTrack of allTracks) {
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
    const mouseLatLng = map.layerPointToLatLng(mouse);
    const mouseDiffLatLng = map.layerPointToLatLng([mouse.x + this.eventPixelMaxDistance, mouse.y + this.eventPixelMaxDistance]);
    const maxLatDiff = Math.abs(mouseDiffLatLng.lat - mouseLatLng.lat);
    const maxLngDiff = Math.abs(mouseDiffLatLng.lng - mouseLatLng.lng);

    for (let segmentIndex = 0; segmentIndex < track.segments.length; ++segmentIndex) {
      const segment = track.segments[segmentIndex];
      for (let pointIndex = 0; pointIndex < segment.points.length; ++pointIndex) {
        const pt = segment.points[pointIndex];
        if (Math.abs(pt.pos.lat - mouseLatLng.lat) > maxLatDiff || Math.abs(pt.pos.lng - mouseLatLng.lng) > maxLngDiff) continue;
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

  private updateTools(): void {
    this.leftToolsItems = this.leftTools ? combineMenuSources([this.defaultLeftToolsItems, this.leftTools]) : this.defaultLeftToolsItems;
    this.rightToolsItems = this.rightTools ? combineMenuSources([this.defaultRightToolsItems, this.rightTools]) : this.defaultLeftToolsItems;
  }

  public readonly toolsContext$: Observable<MapToolContext | undefined> = this._map$.pipe(
    map(m => m ? {injector: this.injector, mapComponent: this, map: m} : undefined),
  );
  leftToolsItems: MenuSource = [];
  private readonly defaultLeftToolsItems = this.toolsContext$.pipe(
    map(context => {
      if (!context) return [];
      return [
        new MenuItem(new ZoomInTool().toMenuItemConfig(context)),
        new MenuItem({...new ZoomLevelTool().toMenuItemConfig(context), textSize: '11px', cssClass: 'no-space'}),
        new MenuItem({...new ZoomOutTool().toMenuItemConfig(context), cssClass: 'no-space'}),
        new MenuSeparator(),
        new MenuItem(new MapFitBoundsTool().toMenuItemConfig(context)),
        new MenuSeparator(),
        new MenuItem(new GoBackTool().toMenuItemConfig(context)),
        new MenuSeparator(),
        new MenuItem(new MapShowPositionTool(this.mapGeolocation, this.disableShowPosition$).toMenuItemConfig(context)),
        new MenuItem(new MapCenterOnPositionTool(this.locationMarker$.pipe(map(marker => !!marker)), this._followingLocation$).toMenuItemConfig(context)),
      ];
    })
  );
  rightToolsItems: MenuSource = [];
  private readonly additionsTool = new AdditionsTool();
  private readonly defaultRightToolsItems = this.toolsContext$.pipe(
    map(context => {
      if (!context) return [];
      return [
        new MenuItem(new MapLayerSelectionTool().toMenuItemConfig(context)),
        new MenuItem(this.additionsTool.toMenuItemConfig(context)),
        new MenuItem(new DarkMapToggleTool().toMenuItemConfig(context)),
        new MenuSeparator(),
        new MenuItem(new DownloadMapTool(this.downloadMapTrail).toMenuItemConfig(context)),
        new MenuItem(new PhoneLockTool(this.injector.get(ScreenLockService), this.mapGeolocation).toMenuItemConfig(context)),
      ];
    })
  );

}
