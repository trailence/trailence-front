import { Component, Injector, Input, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { AbstractComponent } from '@trailence/utils/component-utils';
import { Trail } from '@trailence/model/trail';
import { TrailsListComponent } from '../trails-list/trails-list.component';
import { BehaviorSubject, combineLatest, map, Observable, of, Subscription, switchMap } from 'rxjs';
import { IonSegment, IonSegmentButton, IonButton, IonIcon, IonSpinner } from "@ionic/angular";
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { TrackService } from '@trailence/services/database/track.service';
import { TrailOverviewComponent } from '../trail-overview/trail-overview.component';
import { Router } from '@angular/router';
import { List } from 'immutable';
import { BrowserService } from '@trailence/services/browser/browser.service';
import { SearchPlaceComponent } from '../search-place/search-place.component';
import { Place } from '@trailence/services/geolocation/place';
import { ToolbarComponent } from '../menus/toolbar/toolbar.component';
import { MenuItem } from '../menus/menu-item';
import { NetworkService } from '@trailence/services/network/network.service';
import { ANONYMOUS_USER, AuthService } from '@trailence/services/auth/auth.service';
import { FetchSourceService } from '@trailence/services/fetch-source/fetch-source.service';
import { TrackMetadataConfig } from '../track-metadata/track-metadata.component';
import { AsyncPipe } from '@angular/common';
import { HIGHLIGHTED_TRACK_COLOR, PRIMARY_TRACK_COLOR, PRIMARY_TRACK_COLOR_DONE } from '../trail/trail-colors';
import { MapComponent, MapOptions } from '../map/map.component';
import { MAP_SELECTED_TRACK_LAYER, MAP_TRACKS_LAYER, MapElement } from '../map/map-element';
import { MapBubble } from '../map/elements/map-bubble';
import { MapTool, MapToolGroup } from '../map/map-tool';
import { ToggleBubblesTool } from './toggle-bubble-tool';
import { Arrays } from '@trailence/utils/arrays';
import { MapTrackPath } from '../map/elements/map-track-path';
import { Color } from '@trailence/utils/color';
import { MapTrackAnchors } from '../map/elements/map-track-anchors';
import { bboxPadRatio, isPointInBBox } from '@trailence/utils/latlng';
import { SimplifiedTrackSnapshot } from '@trailence/model/snapshots';
import { distance2d } from '@trailence/utils/geometry-utils';
import { MapPointerEvent } from '../map/map-events';

const LOCALSTORAGE_KEY_BUBBLES = 'trailence.trails.bubbles';

@Component({
    selector: 'app-trails-and-map',
    templateUrl: './trails-and-map.component.html',
    styleUrls: ['./trails-and-map.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
      IonIcon, IonButton, IonSegmentButton, IonSegment, IonSpinner,
      TrailsListComponent,
      MapComponent,
      TrailOverviewComponent,
      SearchPlaceComponent,
      ToolbarComponent,
      AsyncPipe,
    ]
})
export class TrailsAndMapComponent extends AbstractComponent {

  @Input() viewId!: string;

  @Input() trails$?: List<Observable<Trail | null>>;
  @Input() bubbles$?: Observable<MapBubble[]>;
  @Input() collectionUuid?: string;
  @Input() type?: string;

  @Input() message?: string;
  @Input() enableRemoveByGesture = false;
  @Input() enableSearchPlace = false;
  @Input() showPublished = false;
  @Input() searching = false;

  @Input() mapTopToolbar$?: Observable<MenuItem[]>;
  @Input() listToolbar?: MenuItem[];

  mode =  '';
  listSize: 'large' | 'medium' | 'small' = 'large';
  tab = 'map';
  trailSheetMode = 'none';
  trailSheetMetadataClass = 'two-columns';
  isSmall = false;
  trailSheetMaxSize = 240;

  highlightedTrail?: Trail;
  bottomSheetTrails?: Trail[];
  bottomSheetTrailsIndex = 0;
  bottomSheetMetadataConfig: TrackMetadataConfig = {
    mergeDurationAndEstimated: true,
    showBreaksDuration: false,
    showHighestAndLowestAltitude: false,
    allowSmallOnOneLine: true,
    mayHave2Values: false,
    alwaysShowElevation: false,
    showSpeed: false,
  };

  private readonly tracksAndBubbles$ = new BehaviorSubject<MapElement[]>([]);
  private readonly highlightedTrailAnchors$ = new BehaviorSubject<MapTrackAnchors | undefined>(undefined);
  mapElements$ = combineLatest([this.tracksAndBubbles$, this.highlightedTrailAnchors$]).pipe(
    map(([elements, anchors]) => {
      if (!anchors) return elements;
      return [...elements, anchors];
    }),
  );
  mapOptions: MapOptions = {
  };
  private readonly _bubbles$ = new BehaviorSubject<MapBubble[]>([]);
  private readonly mapTrails$ = new BehaviorSubject<Trail[]>([]);
  private readonly tracksAndBubblesTool = new ToggleBubblesTool(this.injector, this.mapTrails$, this._bubbles$, this.map$);
  readonly mapTools$ = new BehaviorSubject<{groups?: MapToolGroup[], tools?: MapTool[]}>({tools: [this.tracksAndBubblesTool]});

  searchPlaceExpanded = false;

  private readonly _map$ = new BehaviorSubject<MapComponent | undefined>(undefined);
  @ViewChild(MapComponent) set mapComponent(v: MapComponent) { this._map$.next(v); }
  public get map$() { return this._map$; }
  public get map() { return this._map$.value; }

  private readonly _trailsList$ = new BehaviorSubject<TrailsListComponent | undefined>(undefined);
  @ViewChild(TrailsListComponent) set trailsListComponent(v: TrailsListComponent) { this._trailsList$.next(v); };
  public get trailsList$() { return this._trailsList$; }
  public get trailsList() { return this._trailsList$.value; }

  @ViewChild(SearchPlaceComponent) searchPlace?: SearchPlaceComponent;

  @ViewChild('mapToolbarTop') mapToolbarTop?: ToolbarComponent;
  mapToolbarTopItems: MenuItem[] = [];

  constructor(
    injector: Injector,
    private readonly browser: BrowserService,
    public i18n: I18nService,
    private readonly trackService: TrackService,
    private readonly router: Router,
    private readonly networkService: NetworkService,
    private readonly auth: AuthService,
  ) {
    super(injector);
    this.whenVisible.subscribe(browser.resize$, () => this.updateMode());
    this.visible$.subscribe(() => this.updateMode());
    this.map$.subscribe(map => {
      if (!map) return;
      map.events.click.addListener(e => this.onMapClick(e));
    });
  }

  protected override initComponent(): void {
    this.updateMode();
    this.tracksAndBubblesTool.clickOnTrail.subscribe(click => this.onTrailClickOnMap(click.mapTrack, click.event));
  }

  mapReady = false;
  private mapTrailsReceived = false;

  protected override getComponentState() {
    return { trails$: this.trails$, bubbles$: this.bubbles$, mapTopToolbar$: this.mapTopToolbar$, enableSearchPlace: this.enableSearchPlace, type: this.type }
  }

  private mapTopToolbarSubscription?: Subscription;

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.tracksAndBubblesTool.setStateKey(this.type !== 'search' ? LOCALSTORAGE_KEY_BUBBLES + '.' + this.viewId : undefined);

    if (previousState?.trails$ === undefined && this.trails$?.size === 0) {
      if (this.isSmall && this.tab === 'map' && this.viewId !== 'search-trails') {
        this.setTab('list');
      }
    }
    const searchPlaceItems = this.enableSearchPlace ? [
      new MenuItem().setIcon('search-position')
        .setI18nLabel(() => this.mapTopToolbar$ || this.isSmall ? 'search_place.placeholder' : undefined)
        .setDisabled(() => !this.networkService.internet || !this.networkService.server || this.auth.email === ANONYMOUS_USER)
        .setVisible(() => !!this.auth.email && !this.searchPlaceExpanded)
        .setAction(() => this.expandSearchPlace()),
      new MenuItem().setCustomContentSelector('app-search-place').setVisible(() => this.searchPlaceExpanded),
      new MenuItem().setIcon('chevron-left').setAction(() => this.collapseSearchPlace()).setVisible(() => this.searchPlaceExpanded),
    ] : [];
    const filtersItem = new MenuItem()
      .setIcon('filters').setI18nLabel('tools.filters')
      .setVisible(() => this.isSmall && !this.searchPlaceExpanded)
      .setBadgeTopRight(() => {
        const nb = this.trailsList?.nbActiveFilters(true);
        if (!nb) return undefined;
        return { text: '' + nb, color: 'success', fill: true };
      })
      .setAction(() => this.trailsList?.openFilters());
    this.mapToolbarTopItems = [filtersItem, new MenuItem(), ...searchPlaceItems];
    this.mapTopToolbarSubscription?.unsubscribe();
    this.mapTopToolbarSubscription = undefined;
    if (this.mapTopToolbar$) {
      this.mapTopToolbarSubscription = this.mapTopToolbar$.subscribe(items => {
        this.mapToolbarTopItems = [...items.map(item => item.addVisibleCondition(() => !this.searchPlaceExpanded)), filtersItem, new MenuItem(), ...searchPlaceItems];
        this.mapToolbarTop?.refresh();
      });
    }
    this.byStateAndVisible.subscribe(
      combineLatest([
        this.networkService.internet$, this.networkService.server$, this.auth.auth$,
        this.injector.get(FetchSourceService).getAllowedPlugins$(),
        this.trailsList$.pipe(switchMap(tl => tl?.filters$ || of(undefined)))
      ]),
      () => this.mapToolbarTop?.refresh()
    );
    this.mapReady = false;
    this.byStateAndVisible.subscribe(this.bubbles$ ?? of([]), bubbles => this._bubbles$.next(bubbles));
    this.byStateAndVisible.subscribe(
      this.tracksAndBubblesTool.getMapElements$(),
      elements => {
        if (this.highlightedTrail)
          this.highlightedTrail = (elements.find(e => e instanceof MapTrackPath && !!e.trail && e.trail.owner === this.highlightedTrail?.owner && e.trail.uuid === this.highlightedTrail?.uuid) as MapTrackPath | undefined)?.trail;
        this.tracksAndBubbles$.next(elements);
        this.setHighlighted(this.highlightedTrail);
        if (!this.mapReady && (this.mapTrailsReceived || this.type === 'search')) {
          this.mapReady = true;
        }
        this.changesDetection.detectChanges();
      }
    );
  }

  updateMap(trails: Trail[]): void {
    if (!this.mapTrailsReceived || !Arrays.sameContent(trails, this.mapTrails$.value)) {
      this.mapTrailsReceived = true;
      this.mapTrails$.next(trails);
    }
    this.mapToolbarTop?.refresh();
  }

  setTab(tab: string): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.updateMode();
  }

  private updateMode(): void { // NOSONAR
    if (!this.visible) {
      this.updateVisibility(false, false, false);
      return;
    }
    const w = this.browser.width;
    const h = this.browser.height;
    this.trailSheetMaxSize = w;
    if (w >= 650 + 350) {
      this.mode = 'large list-two-cols';
      this.listSize = 'large';
      this.trailSheetMode = 'none';
      this.isSmall = false;
      this.updateVisibility(true, true, false);
    } else if (w >= 550 + 250) {
      this.mode = 'large list-one-col-large';
      this.listSize = 'medium';
      this.trailSheetMode = 'none';
      this.isSmall = false;
      this.updateVisibility(true, true, false);
    } else if (w >= 550 + 175) {
      this.mode = 'large list-one-col-small';
      this.listSize = 'small';
      this.trailSheetMode = 'none';
      this.isSmall = false;
      this.updateVisibility(true, true, false);
    } else if (h > w) {
      this.mode = 'small vertical ' + this.tab;
      this.isSmall = true;
      this.listSize = w >= 350 ? 'large' : w >= 250 ? 'medium' : 'small';
      if (this.tab === 'map') {
        this.trailSheetMode = 'bottom';
        if (w < 500 + 36) this.trailSheetMode += ' two-rows';
        this.trailSheetMetadataClass = 'two-columns';
        this.updateVisibility(true, false, true);
      } else {
        this.trailSheetMode = 'none';
        this.updateVisibility(false, true, false);
      }
    } else {
      this.mode = 'small horizontal ' + this.tab;
      this.isSmall = true;
      this.listSize = w >= 350 ? 'large' : w >= 250 ? 'medium' : 'small';
      if (this.tab === 'map') {
        this.trailSheetMode = 'bottom';
        if (w < 500 + 36) this.trailSheetMode += ' two-rows';
        this.trailSheetMetadataClass = 'two-columns';
        this.updateVisibility(true, false, true);
      } else {
        this.trailSheetMode = 'none';
        this.updateVisibility(false, true, false);
      }
    }
  }

  private updateVisibility(mapVisible: boolean, listVisible: boolean, trailSheetVisible: boolean): void {
    for (const child of this._children$.value) {
      if (child instanceof MapComponent) {
        child.setVisible(mapVisible);
        if (this.map$.value !== child) this.map$.next(child);
      } else if (child instanceof TrailsListComponent) {
        child.setVisible(listVisible);
        child.changesDetection.detectChanges();
      } else if (child instanceof TrailOverviewComponent) child.setVisible(trailSheetVisible);
    };
  }

  protected override getChildVisibility(child: AbstractComponent): boolean | undefined {
    if (child instanceof MapComponent) return !this.isSmall || this.tab === 'map';
    if (child instanceof TrailsListComponent) return !this.isSmall || this.tab !== 'map';
    if (child instanceof TrailOverviewComponent) return this.isSmall;
    return undefined;
  }

  protected override _propagateVisible(visible: boolean): void {
    // no
  }

  toggleHighlightedTrail(trail: Trail, others?: Trail[]): void {
    if (this.highlightedTrail === trail) {
      this.setHighlighted(undefined);
    } else {
      this.setHighlighted(trail);
    }
    this.bottomSheetTrails = others && others.length > 0 ? [trail, ...others] : undefined;
    this.bottomSheetTrailsIndex = 0;
    this.changesDetection.detectChanges();
  }

  navigateBottomSheetTrail(index: number): void {
    if (!this.bottomSheetTrails) return;
    const nb = this.bottomSheetTrails.length;
    this.bottomSheetTrailsIndex = index < 0 ? 0 : index >= nb ? nb - 1 : index;
    this.setHighlighted(this.bottomSheetTrails[this.bottomSheetTrailsIndex]);
    this.changesDetection.detectChanges();
  }

  private setHighlighted(trail: Trail | undefined): void { // NOSONAR
    let highlightedMapTrack: MapTrackPath | undefined;
    for (const mapTrack of this.tracksAndBubbles$.value) {
      if (!(mapTrack instanceof MapTrackPath)) continue;
      const highlighted = !!trail && trail.uuid === mapTrack.trail?.uuid && trail.owner === mapTrack.trail?.owner;
      const unhighlighted = !highlighted && !!this.highlightedTrail && this.highlightedTrail.uuid === mapTrack.trail?.uuid && this.highlightedTrail.owner === mapTrack.trail?.owner;
      mapTrack.color = Color.parse(highlighted ? HIGHLIGHTED_TRACK_COLOR : (trail ? PRIMARY_TRACK_COLOR_DONE : PRIMARY_TRACK_COLOR));
      if (!highlighted && !unhighlighted) continue;
      if (highlighted) highlightedMapTrack = mapTrack;
      mapTrack.setPositionOnMap({layer: highlighted ? MAP_SELECTED_TRACK_LAYER : MAP_TRACKS_LAYER});
    }
    if (this.highlightedTrailAnchors$.value?.track !== highlightedMapTrack?.track) {
      this.highlightedTrailAnchors$.next(
        highlightedMapTrack ? new MapTrackAnchors(highlightedMapTrack.track, this.i18n, false, true, false, false) : undefined
      );
    }
    this.trailsList?.setHighlighted(trail);
    this.highlightedTrail = trail;
  }

  onTrailClickOnList(trail: Trail, showOnMap: boolean = false): void {
    const mt = this.tracksAndBubbles$.value.find(t => t instanceof MapTrackPath && t.trail?.owner === trail.owner && t.trail?.uuid === trail.uuid) as MapTrackPath | undefined;
    if (mt)
      void this.map?.ensureVisible(mt, 10, true);
    if (this.tab === 'list' && !this.mode.includes('large')) {
      if (this.highlightedTrail !== trail) this.toggleHighlightedTrail(trail);
      if (showOnMap)
        this.setTab('map');
      this.changesDetection.detectChanges();
    } else {
      this.toggleHighlightedTrail(trail);
    }
  }

  private onTrailClickOnMap(mapTrack: MapTrackPath, event: MapPointerEvent): void {
    const trail = mapTrack.trail!;
    const otherTrails: Trail[] = [];
    for (const track of this.tracksAndBubbles$.value) {
      if (track === mapTrack) continue;
      if (!(track instanceof MapTrackPath)) continue;
      const bounds = track.getBoundsFromSimplifiedTrack();
      if (!bounds) continue;
      if (!isPointInBBox(event.geographicPoint, bboxPadRatio(bounds, 1))) continue;
      for (const pt of (track.track as SimplifiedTrackSnapshot).points) {
        const pixel = event.renderer.projectToViewport(pt);
        const distance = distance2d(event.viewportPoint, pixel);
        if (distance <= 15) {
          otherTrails.push(track.trail!);
          break;
        }
      }
    }
    this.toggleHighlightedTrail(trail, otherTrails);
  }

  private onMapClick(event: MapPointerEvent): void {
    const close: {track: MapTrackPath, distance: number}[] = [];
    for (const track of this.tracksAndBubbles$.value) {
      if (!(track instanceof MapTrackPath)) continue;
      const bounds = track.getBoundsFromSimplifiedTrack();
      if (!bounds) continue;
      if (!isPointInBBox(event.geographicPoint, bboxPadRatio(bounds, 1))) continue;
      let bestDistance: number | undefined = undefined;
      for (const pt of (track.track as SimplifiedTrackSnapshot).points) {
        const pixel = event.renderer.projectToViewport(pt);
        const distance = distance2d(event.viewportPoint, pixel);
        if (distance <= 15 && (bestDistance === undefined || distance < bestDistance)) {
          bestDistance = distance;
        }
      }
      if (bestDistance !== undefined)
        close.push({track, distance: bestDistance});
    }
    if (close.length === 0) {
      if (this.highlightedTrail)
        this.toggleHighlightedTrail(this.highlightedTrail);
    } else {
      close.sort((t1, t2) => t1.distance - t2.distance);
      const closest = close.splice(0, 1)[0];
      if (closest.track.trail !== this.highlightedTrail)
        this.toggleHighlightedTrail(closest.track.trail!, close.map(t => t.track.trail!));
    }
  }

  openTrail(trail: Trail): void {
    void this.router.navigate(['/trail/' + trail.owner + '/' + trail.uuid], {queryParams: { from: this.router.url }});
  }

  expandSearchPlace(): void {
    this.searchPlaceExpanded = true;
    this.mapToolbarTop?.refresh();
    this.changesDetection.detectChanges(() => {
      setTimeout(() => {
        this.searchPlace?.setFocus();
      }, 0);
    });
  }

  collapseSearchPlace(): void {
    this.searchPlaceExpanded = false;
    this.mapToolbarTop?.refresh();
    this.changesDetection.detectChanges();
  }

  goToPlace(place: Place): void {
    if (place.north && place.south && place.east && place.west)
      this.map?.renderer?.fitBounds({minlat: place.north, maxlat: place.south, minlng: place.east, maxlng: place.west}, true);
    else if (place.lat && place.lng)
      this.map?.renderer?.goTo({lat: place.lat, lng: place.lng}, 14, true);
    this.searchPlaceExpanded = false;
  }

}
