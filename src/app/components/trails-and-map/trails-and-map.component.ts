import { ChangeDetectorRef, Component, Injector, Input, ViewChild } from '@angular/core';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { Trail } from 'src/app/model/trail';
import { TrailsListComponent } from '../trails-list/trails-list.component';
import { BehaviorSubject, combineLatest, map, of, switchMap } from 'rxjs';
import { IonSegment, IonSegmentButton, IonIcon } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MapComponent } from '../map/map.component';
import { MapTrack } from '../map/track/map-track';
import { TrackService } from 'src/app/services/database/track.service';
import { MapTrackPointReference } from '../map/track/map-track-point-reference';
import { TrailOverviewComponent } from '../trail-overview/trail-overview.component';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SimplifiedTrackSnapshot, TrackMetadataSnapshot } from 'src/app/services/database/track-database';
import { CollectionMapper } from 'src/app/utils/arrays';
import { List } from 'immutable';
import { BrowserService } from 'src/app/services/browser/browser.service';
import L from 'leaflet';
import { MapBubble } from '../map/bubble/map-bubble';
import { Console } from 'src/app/utils/console';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { SearchPlaceComponent } from '../search-place/search-place.component';
import { Place } from 'src/app/services/geolocation/place';

const LOCALSTORAGE_KEY_BUBBLES = 'trailence.trails.bubbles';

@Component({
    selector: 'app-trails-and-map',
    templateUrl: './trails-and-map.component.html',
    styleUrls: ['./trails-and-map.component.scss'],
    imports: [
      IonIcon, IonSegmentButton, IonSegment,
      TrailsListComponent, MapComponent, TrailOverviewComponent, CommonModule, SearchPlaceComponent,
    ]
})
export class TrailsAndMapComponent extends AbstractComponent {

  @Input() viewId!: string;

  @Input() trails: List<Trail> = List();
  @Input() collectionUuid?: string;
  @Input() type?: string;

  @Input() message?: string;
  @Input() enableRemoveByGesture = false;
  @Input() enableSearchPlace = false;

  mode =  '';
  listSize: 'large' | 'medium' | 'small' = 'large';
  tab = 'map';
  trailSheetMode = 'none';
  trailSheetMetadataClass = 'two-columns';
  isSmall = false;

  highlightedTrail?: Trail;
  mapTracksMapper = new CollectionMapper<{trail: Trail, data: SimplifiedTrackSnapshot}, MapTrack>(
    trailAndTrack => new MapTrack(trailAndTrack.trail, trailAndTrack.data, 'red', 4, false, this.i18n),
    (t1, t2) => t1.data === t2.data
  );
  mapTracks$ = new BehaviorSubject<MapTrack[]>([]);
  mapBubbles$ = new BehaviorSubject<MapBubble[]>([]);

  showBubbles$ = new BehaviorSubject<boolean>(false);

  searchPlaceExpanded = false;

  private readonly _map$ = new BehaviorSubject<MapComponent | undefined>(undefined);

  public get map$() { return this._map$; }
  public get map() { return this._map$.value; }

  @ViewChild(TrailsListComponent) trailsList?: TrailsListComponent;
  @ViewChild(MapComponent) set mapComponent(v: MapComponent) { this._map$.next(v); }
  @ViewChild(SearchPlaceComponent) searchPlace?: SearchPlaceComponent;

  constructor(
    injector: Injector,
    private readonly browser: BrowserService,
    public i18n: I18nService,
    private readonly trackService: TrackService,
    private readonly router: Router,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    super(injector);
    this.whenVisible.subscribe(browser.resize$, () => this.updateMode());
    this.visible$.subscribe(() => this.updateMode());
  }

  protected override initComponent(): void {
    const showBubblesState = localStorage.getItem(LOCALSTORAGE_KEY_BUBBLES + '.' + this.viewId);
    if (showBubblesState) {
      try {
        this.showBubbles$.next(!!JSON.parse(showBubblesState));
      } catch (e) { // NOSONAR
        // ignore
      }
    }
    this.updateMode();
    setTimeout(() => this.initDelayed(), 0);
  }

  private initDelayed(): void {
    const mapZoom$ = this.showBubbles$.pipe(
      switchMap(showBubbles => {
        localStorage.setItem(LOCALSTORAGE_KEY_BUBBLES + '.' + this.viewId, JSON.stringify(showBubbles));
        if (!showBubbles) return of(undefined);
        return this.map!.getState().zoom$;
      })
    );
    this.whenVisible.subscribe(
      combineLatest([this.mapTrails$, mapZoom$]).pipe(
        switchMap(([trails, zoom]) =>
          trails.isEmpty() ? of({zoom, trails: []}) : combineLatest(
            trails.map(
              trail => trail.currentTrackUuid$.pipe(
                switchMap(trackUuid => {
                  if (zoom === undefined) return this.trackService.getSimplifiedTrack$(trackUuid, trail.owner);
                  return this.trackService.getMetadata$(trackUuid, trail.owner);
                }),
                filterDefined(),
                map(data => ({trail, data})),
              )
            ).toArray()
          ).pipe(
            map(trailsAndData => ({zoom, trails: trailsAndData}))
          )
        )
      ),
      result => {
        if (this.highlightedTrail)
          this.highlightedTrail = result.trails.find(t => t.trail.owner === this.highlightedTrail?.owner && t.trail.uuid === this.highlightedTrail?.uuid)?.trail;
        if (result.zoom === undefined) {
          if (this.mapBubbles$.value.length > 0)
            this.mapBubbles$.next([]);
          if (result.trails.length === 0) {
            if (this.mapTracks$.value.length > 0)
              this.mapTracks$.next([]);
            return;
          }
          this.mapTracks$.next(this.mapTracksMapper.update(result.trails as {trail: Trail, data: SimplifiedTrackSnapshot}[]));
          return;
        }
        if (this.mapTracks$.value.length > 0)
          this.mapTracks$.next([]);
        if (result.trails.length === 0) {
          if (this.mapBubbles$.value.length > 0)
            this.mapBubbles$.next([]);
          return;
        }
        this.mapBubbles$.next(MapBubble.build(result.trails.map(
          trail => {
            const meta = trail.data as TrackMetadataSnapshot;
            if (!meta.bounds) return undefined;
            //[[north, east], [south, west]]
            return L.latLng(meta.bounds[0][0] + (meta.bounds[1][0] - meta.bounds[0][0]) / 2, meta.bounds[0][1] + (meta.bounds[1][1] - meta.bounds[0][1]) / 2);
          }
        ).filter(p => !!p), result.zoom));
      }
    );
  }

  protected override getComponentState() {
    return {trails: this.trails}
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.mapTrails$.next(this.trails);
  }

  private readonly mapTrails$ = new BehaviorSubject<List<Trail>>(List());
  updateMap(trails: Trail[]): void {
    const newList = List(trails);
    if (!newList.equals(this.mapTrails$.value))
      this.mapTrails$.next(newList);
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
        child.changeDetector.detectChanges();
      } else if (child instanceof TrailOverviewComponent) child.setVisible(trailSheetVisible);
      else Console.error('unexpected child', child);
    });
  }

  protected override _propagateVisible(visible: boolean): void {
    // no
  }

  toggleHighlightedTrail(trail: Trail): void {
    if (this.highlightedTrail === trail) {
      this.highlight(trail, false);
      this.highlightedTrail = undefined;
    } else {
      if (this.highlightedTrail) this.highlight(this.highlightedTrail, false);
      this.highlightedTrail = trail;
      this.highlight(trail, true);
    }
    this.changeDetector.detectChanges();
  }

  private highlight(trail: Trail, highlight: boolean): void {
    const mapTrack = this.mapTracks$.value.find(mt => mt.trail?.uuid === trail.uuid && mt.trail?.owner === trail.owner);
    if (mapTrack) {
      mapTrack.color = highlight ? '#4040FF' : 'red';
      mapTrack.showDepartureAndArrivalAnchors(highlight);
      if (highlight)
        mapTrack.bringToFront();
      else
        mapTrack.bringToBack();
    }
    this.trailsList?.setHighlighted(highlight ? trail : undefined);
  }

  onTrailClickOnList(trail: Trail): void {
    this.toggleHighlightedTrail(trail);
    if (this.tab === 'list' && this.mode.indexOf('large') < 0) {
      this.setTab('map');
      this.changeDetector.detectChanges();
    }
    const mt = this.mapTracks$.value.find(t => t.trail?.owner === trail.owner && t.trail?.uuid === trail.uuid);
    if (mt && this.map)
      this.map.ensureVisible(mt);
  }

  onTrailClickOnMap(event: MapTrackPointReference[]): void {
    const closest = MapTrackPointReference.closest(event);
    if (closest?.track.trail) {
      this.toggleHighlightedTrail(closest.track.trail);
    } else if (this.highlightedTrail) {
      this.toggleHighlightedTrail(this.highlightedTrail);
    }
  }

  openTrail(trail: Trail): void {
    this.router.navigate(['/trail/' + trail.owner + '/' + trail.uuid], {queryParams: { from: this.router.url }});
  }

  expandSearchPlace(): void {
    this.searchPlaceExpanded = true;
    this.changeDetector.detectChanges();
    setTimeout(() => {
      this.searchPlace?.setFocus();
    }, 0);
  }

  goToPlace(place: Place): void {
    this.map?.goTo(place.lat, place.lng, 14);
    this.searchPlaceExpanded = false;
  }

}
