import { ChangeDetectorRef, Component, Injector, Input, ViewChild } from '@angular/core';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { Trail } from 'src/app/model/trail';
import { TrailsListComponent } from '../trails-list/trails-list.component';
import { BehaviorSubject, combineLatest, map, Observable, of, Subscription, switchMap } from 'rxjs';
import { IonSegment, IonSegmentButton, IonButton, IonIcon, IonSpinner } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MapComponent } from '../map/map.component';
import { MapTrack } from '../map/track/map-track';
import { TrackService } from 'src/app/services/database/track.service';
import { MapTrackPointReference } from '../map/track/map-track-point-reference';
import { TrailOverviewComponent } from '../trail-overview/trail-overview.component';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CollectionMapper } from 'src/app/utils/arrays';
import { List } from 'immutable';
import { BrowserService } from 'src/app/services/browser/browser.service';
import * as L from 'leaflet';
import { MapBubble } from '../map/bubble/map-bubble';
import { Console } from 'src/app/utils/console';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { SearchPlaceComponent } from '../search-place/search-place.component';
import { Place } from 'src/app/services/geolocation/place';
import { ToolbarComponent } from '../menus/toolbar/toolbar.component';
import { MenuItem } from '../menus/menu-item';
import { ModerationService } from 'src/app/services/moderation/moderation.service';
import { NetworkService } from 'src/app/services/network/network.service';
import { ANONYMOUS_USER, AuthService } from 'src/app/services/auth/auth.service';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { TrackMetadataConfig } from '../track-metadata/track-metadata.component';
import { SimplifiedTrackSnapshot, TrackMetadataSnapshot } from 'src/app/model/snapshots';

@Component({
    selector: 'app-trails-and-map',
    templateUrl: './trails-and-map.component.html',
    styleUrls: ['./trails-and-map.component.scss'],
    imports: [
      IonIcon, IonButton, IonSegmentButton, IonSegment, IonSpinner,
      TrailsListComponent, MapComponent, TrailOverviewComponent, CommonModule, SearchPlaceComponent,
      ToolbarComponent,
    ]
})
export class TrailsAndMapComponent extends AbstractComponent {

  @Input() viewId!: string;

  @Input() trails$?: List<Observable<Trail | null>>;
  @Input() bubbles$?: Observable<MapBubble[]>;
  @Input() showBubbles$!: BehaviorSubject<boolean>;
  @Input() bubblesToolAvailable$!: BehaviorSubject<boolean>;
  @Input() collectionUuid?: string;
  @Input() type?: string;

  @Input() message?: string;
  @Input() enableRemoveByGesture = false;
  @Input() enableSearchPlace = false;
  @Input() showPublished = false;
  @Input() searching = false;

  @Input() mapTopToolbar$?: Observable<MenuItem[]>;

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
  mapTracks$ = new BehaviorSubject<MapTrack[]>([]);
  mapBubbles$ = new BehaviorSubject<MapBubble[]>([]);
  private readonly givenBubbles$ = new BehaviorSubject<MapBubble[]>([]);

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
  }

  protected override initComponent(): void {
    this.updateMode();
    setTimeout(() => this.initDelayed(), 0);
  }

  mapReady = false;
  private mapTrailsReceived = false;
  private initDelayed(): void {
    const mapZoom$ = this.map$.pipe(switchMap(map => map ? map.getState().zoom$ : of(undefined)));
    this.whenVisible.subscribe(
      combineLatest([
        combineLatest([this.mapTrails$, mapZoom$, this.showBubbles$]).pipe(
          switchMap(([trails, zoom, showBubbles]) =>
            trails.isEmpty() ? of({zoom, trails: [], showBubbles}) : combineLatest(
              trails.map(
                trail => trail.currentTrackUuid$.pipe(
                  switchMap(trackUuid => {
                    if (!showBubbles) return trail.fromModeration ? this.injector.get(ModerationService).getSimplifiedTrack$(trail.uuid, trail.owner, trackUuid) : this.trackService.getSimplifiedTrack$(trackUuid, trail.owner);
                    return this.trackService.getMetadata$(trackUuid, trail.owner);
                  }),
                  filterDefined(),
                  map(data => ({trail, data})),
                )
              ).toArray()
            ).pipe(
              map(trailsAndData => ({zoom, trails: trailsAndData, showBubbles}))
            )
          )
        ),
        this.givenBubbles$,
      ]),
      ([result, bubbles]) => {
        this.update(result.zoom, result.trails, result.showBubbles, bubbles);
        if (!this.mapReady && (this.mapTrailsReceived || this.type === 'search')) {
          this.mapReady = true;
          this.changesDetection.detectChanges();
        }
      }
    );
  }

  private update(zoom: number | undefined, trails: {trail: Trail, data: SimplifiedTrackSnapshot | TrackMetadataSnapshot}[], showBubbles: boolean, bubbles: MapBubble[]): void {
    if (this.highlightedTrail)
      this.highlightedTrail = trails.find(t => t.trail.owner === this.highlightedTrail?.owner && t.trail.uuid === this.highlightedTrail?.uuid)?.trail;
    if (!showBubbles) {
      if (this.mapBubbles$.value.length > 0)
        this.mapBubbles$.next([]);
      if (trails.length === 0) {
        if (this.mapTracks$.value.length > 0)
          this.mapTracks$.next([]);
        return;
      }
      this.mapTracks$.next(this.mapTracksMapper.update(trails as {trail: Trail, data: SimplifiedTrackSnapshot}[]));
      if (this.highlightedTrail) this.highlight(this.highlightedTrail, true);
      return;
    }
    if (this.mapTracks$.value.length > 0)
      this.mapTracks$.next([]);
    if (trails.length === 0) {
      this.mapBubbles$.next(bubbles);
      return;
    }
    this.mapBubbles$.next(zoom === undefined ? [] : MapBubble.build(trails.map(
      trail => {
        const meta = trail.data as TrackMetadataSnapshot;
        if (!meta.bounds) return undefined;
        //[[north, east], [south, west]]
        return L.latLng(meta.bounds[0][0] + (meta.bounds[1][0] - meta.bounds[0][0]) / 2, meta.bounds[0][1] + (meta.bounds[1][1] - meta.bounds[0][1]) / 2);
      }
    ).filter(p => !!p), zoom));
  }

  protected override getComponentState() {
    return { trails$: this.trails$, bubbles$: this.bubbles$, mapTopToolbar$: this.mapTopToolbar$, enableSearchPlace: this.enableSearchPlace }
  }

  private mapTopToolbarSubscription?: Subscription;

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    if (previousState?.trails$ === undefined && this.trails$ !== undefined && this.trails$.size === 0) {
      if (this.isSmall && this.tab === 'map' && this.viewId !== 'search-trails') {
        this.setTab('list');
      }
    }
    const searchPlaceItems = this.enableSearchPlace ? [
      new MenuItem().setIcon('search-position')
        .setI18nLabel(this.mapTopToolbar$ ? 'search_place.placeholder' : undefined)
        .setDisabled(() => !this.networkService.internet || !this.networkService.server || this.auth.email === ANONYMOUS_USER)
        .setVisible(() => !!this.auth.email && !this.searchPlaceExpanded)
        .setAction(() => this.expandSearchPlace()),
      new MenuItem().setCustomContentSelector('app-search-place').setVisible(() => this.searchPlaceExpanded),
      new MenuItem().setIcon('chevron-left').setAction(() => this.collapseSearchPlace()).setVisible(() => this.searchPlaceExpanded),
    ] : [];
    this.mapToolbarTopItems = [...searchPlaceItems];
    this.mapTopToolbarSubscription?.unsubscribe();
    this.mapTopToolbarSubscription = undefined;
    if (this.mapTopToolbar$) {
      this.mapTopToolbarSubscription = this.mapTopToolbar$.subscribe(items => {
        this.mapToolbarTopItems = [...items.map(item => item.addVisibleCondition(() => !this.searchPlaceExpanded)), new MenuItem(), ...searchPlaceItems];
        this.mapToolbarTop?.refresh();
      });
    }
    this.byStateAndVisible.subscribe(this.bubbles$ ?? of([]), bubbles => this.givenBubbles$.next(bubbles));
    this.byStateAndVisible.subscribe(
      combineLatest([this.networkService.internet$, this.networkService.server$, this.auth.auth$, this.injector.get(FetchSourceService).getAllowedPlugins$()]),
      () => this.mapToolbarTop?.refresh()
    )
  }

  private readonly mapTrails$ = new BehaviorSubject<List<Trail>>(List());
  updateMap(trails: Trail[]): void {
    const newList = List(trails);
    if (!this.mapTrailsReceived || !newList.equals(this.mapTrails$.value)) {
      this.mapTrailsReceived = true;
      this.mapTrails$.next(newList);
    }
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
        if (w >= 750 || h <= 400) {
          this.trailSheetMode = 'left';
          this.trailSheetMetadataClass = 'one-column';
        } else {
          this.trailSheetMode = 'bottom';
          if (w < 500 + 36) this.trailSheetMode += ' two-rows';
          this.trailSheetMetadataClass = 'tiles';
        }
        this.updateVisibility(true, false, true);
      } else {
        this.trailSheetMode = 'none';
        this.updateVisibility(false, true, false);
      }
    }
  }

  private updateVisibility(mapVisible: boolean, listVisible: boolean, trailSheetVisible: boolean): void {
    this._children$.value.forEach(child => {
      if (child instanceof MapComponent) {
        child.setVisible(mapVisible);
        if (this.map$.value !== child) this.map$.next(child);
      } else if (child instanceof TrailsListComponent) {
        child.setVisible(listVisible);
        child.changesDetection.detectChanges();
      } else if (child instanceof TrailOverviewComponent) child.setVisible(trailSheetVisible);
      else Console.error('unexpected child', child);
    });
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
      this.highlight(trail, false);
      this.highlightedTrail = undefined;
    } else {
      if (this.highlightedTrail) this.highlight(this.highlightedTrail, false);
      this.highlightedTrail = trail;
      this.highlight(trail, true);
    }
    this.bottomSheetTrails = others && others.length > 0 ? [trail, ...others] : undefined;
    this.bottomSheetTrailsIndex = 0;
    this.changesDetection.detectChanges();
  }

  navigateBottomSheetTrail(index: number): void {
    if (!this.bottomSheetTrails) return;
    const nb = this.bottomSheetTrails.length;
    this.bottomSheetTrailsIndex = index < 0 ? 0 : index >= nb ? nb - 1 : index;
    if (this.highlightedTrail)
      this.highlight(this.highlightedTrail, false);
    this.highlightedTrail = this.bottomSheetTrails[this.bottomSheetTrailsIndex];
    this.highlight(this.highlightedTrail, true);
    this.changesDetection.detectChanges();
  }

  private highlight(trail: Trail, highlight: boolean): void {
    const mapTrack = this.mapTracks$.value.find(mt => mt.trail?.uuid === trail.uuid && mt.trail?.owner === trail.owner);
    if (mapTrack) {
      mapTrack.color = highlight ? '#4040FF' : 'red';
      mapTrack.showDepartureAndArrivalAnchors(highlight);
      mapTrack.highlighted = highlight;
      if (highlight)
        mapTrack.bringToFront();
      else
        mapTrack.bringToBack();
    }
    this.trailsList?.setHighlighted(highlight ? trail : undefined);
  }

  onTrailClickOnList(trail: Trail, showOnMap: boolean = false): void {
    const mt = this.mapTracks$.value.find(t => t.trail?.owner === trail.owner && t.trail?.uuid === trail.uuid);
    if (mt && this.map)
      this.map.ensureVisible(mt);
    if (this.tab === 'list' && this.mode.indexOf('large') < 0) {
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
        if (t && t !== trail && !otherTrails.find(ot => ot === t)) {
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
