import { Component, Injector, Input, ViewChild } from '@angular/core';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { Trail } from 'src/app/model/trail';
import { TrailsListComponent } from '../trails-list/trails-list.component';
import { BehaviorSubject, combineLatest, debounceTime, map, Observable, of, skip, Subscription, switchMap } from 'rxjs';
import { IonSegment, IonSegmentButton, IonButton, IonIcon, IonSpinner } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MapComponent } from '../map/map.component';
import { MapTrack } from '../map/track/map-track';
import { TrackService } from 'src/app/services/database/track.service';
import { MapTrackPointReference } from '../map/track/map-track-point-reference';
import { TrailOverviewComponent } from '../trail-overview/trail-overview.component';
import { Router } from '@angular/router';
import { CollectionMapper } from 'src/app/utils/arrays';
import { List } from 'immutable';
import { BrowserService } from 'src/app/services/browser/browser.service';
import * as L from 'leaflet';
import { MapBubble } from '../map/bubble/map-bubble';
import { SearchPlaceComponent } from '../search-place/search-place.component';
import { Place } from 'src/app/services/geolocation/place';
import { ToolbarComponent } from '../menus/toolbar/toolbar.component';
import { MenuItem } from '../menus/menu-item';
import { ModerationService } from 'src/app/services/moderation/moderation.service';
import { NetworkService } from 'src/app/services/network/network.service';
import { ANONYMOUS_USER, AuthService } from 'src/app/services/auth/auth.service';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { TrackMetadataConfig } from '../track-metadata/track-metadata.component';
import { SimplifiedTrackSnapshot } from 'src/app/model/snapshots';
import { AsyncPipe } from '@angular/common';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { Console } from 'src/app/utils/console';
import { MapElement } from '../map/map-element';
import { MapToggleBubblesTool } from '../map/tools/toggle-bubbles-tool';

const LOCALSTORAGE_KEY_BUBBLES = 'trailence.trails.bubbles';

@Component({
    selector: 'app-trails-and-map',
    templateUrl: './trails-and-map.component.html',
    styleUrls: ['./trails-and-map.component.scss'],
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
  mapTracksMapper = new CollectionMapper<{trail: Trail, data: SimplifiedTrackSnapshot}, MapTrack>(
    trailAndTrack => new MapTrack(trailAndTrack.trail, trailAndTrack.data, 'red', 4, false, this.i18n),
    (t1, t2) => t1.data === t2.data
  );
  mapElements$ = new BehaviorSubject<MapElement[]>([]);

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

  private readonly showBubbles$ = new BehaviorSubject<boolean>(false);
  private bubblesToolAvailable = false;

  mapToolbarRightItems: MenuItem[] = [
    new MapToggleBubblesTool(this.showBubbles$, () => this.bubblesToolAvailable).toMenuItem(() => this._map$.value?.getToolContext()),
  ];

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
    this.showBubbles$.pipe(skip(1)).subscribe(
      show => {
        if (this.viewId && this.bubblesToolAvailable && this.type !== 'search') localStorage.setItem(LOCALSTORAGE_KEY_BUBBLES + '.' + this.viewId, JSON.stringify(show));
      }
    );
  }

  protected override initComponent(): void {
    this.updateMode();
  }

  mapReady = false;
  private mapTrailsReceived = false;

  protected override getComponentState() {
    return { trails$: this.trails$, bubbles$: this.bubbles$, mapTopToolbar$: this.mapTopToolbar$, enableSearchPlace: this.enableSearchPlace }
  }

  private mapTopToolbarSubscription?: Subscription;

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    if (this.type !== 'search')
      this.loadShowBubbleState();

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
      .setAction(() => this.trailsList?.filtersModal?.present());
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
    this.byStateAndVisible.subscribe(
      combineLatest([this.mapTrails$, this.bubbles$ ?? of([])]).pipe(
        switchMap(([trails, bubbles]) => {
          // if we have bubbles, we only display bubbles
          if (bubbles.length > 0) {
            this.bubblesToolAvailable = false;
            return of(bubbles);
          }
          if (trails.isEmpty()) {
            this.bubblesToolAvailable = false;
            return of([]);
          }
          this.bubblesToolAvailable = true;
          return combineLatest([
            this.showBubbles$,
            combineLatest(trails.toArray().map(trail => trail.currentTrackUuid$.pipe(map(trackUuid => ({trail, trackUuid}))))),
          ]).pipe(
            switchMap(([showBubbles, trailsAndTracks]) => {
              return showBubbles ? this.getTracksBubbles(trailsAndTracks) : this.getMapTracks(trailsAndTracks);
            })
          );
        }),
      ),
      elements => {
        if (this.highlightedTrail)
          this.highlightedTrail = (elements.find(e => e instanceof MapTrack && !!e.trail && e.trail.owner === this.highlightedTrail?.owner && e.trail.uuid === this.highlightedTrail?.uuid) as MapTrack | undefined)?.trail;
        this.mapElements$.next(elements);
        this.setHighlighted(this.highlightedTrail);
        this.mapToolbarRightItems = [...this.mapToolbarRightItems];
        if (!this.mapReady && (this.mapTrailsReceived || this.type === 'search')) {
          this.mapReady = true;
        }
        this.changesDetection.detectChanges();
      }
    );
  }

  private getTracksBubbles(trailsAndTracks: {trail: Trail, trackUuid: string}[]): Observable<MapBubble[]> {
    const mapZoom$ = this.map$.pipe(switchMap(map => map ? map.getState().zoomInt$ : of(undefined)));
    const tracks$ = combineLatest(
      trailsAndTracks.map(t => this.trackService.getMetadata$(t.trackUuid, t.trail.owner).pipe(
        debounceTimeExtended(1000, 1000, undefined, (p,n) => !!n),
        map(meta => {
          if (!meta) Console.warn('Track not found after 1s for trail', t.trail.owner, t.trail.uuid, t.trail.name);
          return {trail: t.trail, meta};
        })
      ))
    ).pipe(debounceTime(100));
    return combineLatest([mapZoom$, tracks$]).pipe(
      map(([zoom, trails]) => {
        if (zoom === undefined) return [];
        return MapBubble.build(trails.map(
          trail => {
            const meta = trail.meta;
            if (!meta?.bounds) return undefined;
            //[[north, east], [south, west]]
            return L.latLng(meta.bounds[0][0] + (meta.bounds[1][0] - meta.bounds[0][0]) / 2, meta.bounds[0][1] + (meta.bounds[1][1] - meta.bounds[0][1]) / 2);
          }
        ).filter(p => !!p), zoom);
      })
    );
  }

  private getMapTracks(trailsAndTracks: {trail: Trail, trackUuid: string}[]): Observable<MapTrack[]> {
    return combineLatest(trailsAndTracks.map(t =>
      (t.trail.fromModeration ?
        this.injector.get(ModerationService).getSimplifiedTrack$(t.trail.uuid, t.trail.owner, t.trackUuid) :
        this.trackService.getSimplifiedTrack$(t.trackUuid, t.trail.owner))
      .pipe(
        debounceTimeExtended(1000, 1000, undefined, (p,n) => !!n),
        map(track => {
          if (!track) Console.warn('Track not found after 1s for trail', t.trail.owner, t.trail.uuid, t.trail.name);
          return {trail: t.trail, track};
        }),
      )
    )).pipe(
      map(trails => this.mapTracksMapper.update(trails.filter(t => !!t.track).map(t => ({trail: t.trail, data: t.track!})))),
    );
  }

  private readonly mapTrails$ = new BehaviorSubject<List<Trail>>(List());
  updateMap(trails: Trail[]): void {
    const newList = List(trails);
    if (!this.mapTrailsReceived || !newList.equals(this.mapTrails$.value)) {
      this.mapTrailsReceived = true;
      this.mapTrails$.next(newList);
    }
    this.mapToolbarTop?.refresh();
  }

  setTab(tab: string): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.updateMode();
  }

  private loadShowBubbleState(): void {
    const showBubblesState = localStorage.getItem(LOCALSTORAGE_KEY_BUBBLES + '.' + this.viewId);
    if (showBubblesState) {
      try {
        this.showBubbles$.next(!!JSON.parse(showBubblesState));
      } catch (e) { // NOSONAR
        // ignore
        this.showBubbles$.next(false);
      }
    } else {
      this.showBubbles$.next(false);
    }
  }

  private updateMode(): void { // NOSONAR
    if (!this.visible) {
      this.updateVisibility(false, false, false);
      return;
    }
    const w = this.browser.width;
    const h = this.browser.height;
    if (w >= 650 + 350) {
      this.mode = 'large list-two-cols';
      this.listSize = 'large';
      this.trailSheetMode = 'none';
      this.isSmall = false;
      this.updateVisibility(true, true, false);
    } else if (w >= 600 + 250) {
      this.mode = 'large list-one-col-large';
      this.listSize = 'medium';
      this.trailSheetMode = 'none';
      this.isSmall = false;
      this.updateVisibility(true, true, false);
    } else if (w >= 600 + 175) {
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

  private setHighlighted(trail: Trail | undefined): void {
    for (const mapTrack of this.mapElements$.value) {
      if (!(mapTrack instanceof MapTrack)) continue;
      const highlighted = !!trail && trail.uuid === mapTrack.trail?.uuid && trail.owner === mapTrack.trail?.owner;
      const unhighlighted = !highlighted && !!this.highlightedTrail && this.highlightedTrail.uuid === mapTrack.trail?.uuid && this.highlightedTrail.owner === mapTrack.trail?.owner;
      mapTrack.color = highlighted ? '#4040FF' : (trail ? '#FF000080' : 'red');
      if (!highlighted && !unhighlighted) continue;
      mapTrack.showDepartureAndArrivalAnchors(highlighted);
      mapTrack.highlighted = highlighted;
      if (highlighted)
        mapTrack.bringToFront();
      else
        mapTrack.bringToBack();
    }
    this.trailsList?.setHighlighted(trail);
    this.highlightedTrail = trail;
  }

  onTrailClickOnList(trail: Trail, showOnMap: boolean = false): void {
    const mt = this.mapElements$.value.find(t => t instanceof MapTrack && t.trail?.owner === trail.owner && t.trail?.uuid === trail.uuid) as MapTrack | undefined;
    if (mt && this.map)
      this.map.ensureVisible(mt);
    if (this.tab === 'list' && !this.mode.includes('large')) {
      if (this.highlightedTrail !== trail) this.toggleHighlightedTrail(trail);
      if (showOnMap)
        this.setTab('map');
      this.changesDetection.detectChanges();
    } else {
      this.toggleHighlightedTrail(trail);
    }
  }

  onTrailClickOnMap(event: MapTrackPointReference[]): void {
    const closest = MapTrackPointReference.closest(event);
    if (closest?.track.trail) {
      const trail = closest?.track.trail;
      const otherTrails: Trail[] = [];
      for (const ref of event) {
        const t = ref.track.trail;
        if (t && t !== trail && !otherTrails.includes(t)) {
          otherTrails.push(t);
        }
      }
      this.toggleHighlightedTrail(trail, otherTrails);
    } else if (this.highlightedTrail) {
      this.toggleHighlightedTrail(this.highlightedTrail);
    }
  }

  openTrail(trail: Trail): void {
    this.router.navigate(['/trail/' + trail.owner + '/' + trail.uuid], {queryParams: { from: this.router.url }});
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
      this.map?.goToBounds(place.north, place.south, place.east, place.west);
    else if (place.lat && place.lng)
      this.map?.goTo(place.lat, place.lng, 14);
    this.searchPlaceExpanded = false;
  }

}
