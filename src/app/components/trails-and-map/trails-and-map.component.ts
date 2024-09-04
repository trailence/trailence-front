import { Component, Injector, Input, ViewChild } from '@angular/core';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { Platform } from '@ionic/angular';
import { Trail } from 'src/app/model/trail';
import { TrailsListComponent } from '../trails-list/trails-list.component';
import { BehaviorSubject, combineLatest, filter, map, of, switchMap } from 'rxjs';
import { IonSegment, IonSegmentButton, IonButton } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MapComponent } from '../map/map.component';
import { MapTrack } from '../map/track/map-track';
import { TrackService } from 'src/app/services/database/track.service';
import { MapTrackPointReference } from '../map/track/map-track-point-reference';
import { TrailOverviewComponent } from '../trail-overview/trail-overview.component';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SimplifiedTrackSnapshot, TrackMetadataSnapshot } from 'src/app/services/database/track-database';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { CollectionMapper } from 'src/app/utils/arrays';

@Component({
  selector: 'app-trails-and-map',
  templateUrl: './trails-and-map.component.html',
  styleUrls: ['./trails-and-map.component.scss'],
  standalone: true,
  imports: [IonButton, IonSegmentButton, IonSegment,
    TrailsListComponent, MapComponent, TrailOverviewComponent, CommonModule,
  ]
})
export class TrailsAndMapComponent extends AbstractComponent {

  @Input() viewId!: string;

  @Input() trails: Trail[] = [];
  @Input() collectionUuid?: string;

  mode =  '';
  listMetadataClass = 'two-columns';
  tab = 'map';
  trailSheetMode = 'none';
  trailSheetMetadataClass = 'two-columns';
  isSmall = false;

  highlightedTrail?: Trail;
  mapTracksMapper = new CollectionMapper<{trail: Trail, track: SimplifiedTrackSnapshot}, MapTrack>(
    trailAndTrack => new MapTrack(trailAndTrack.trail!, trailAndTrack.track!, 'red', 4, false, this.i18n),
    (t1, t2) => t1.track === t2.track
  );
  mapTracks$ = new BehaviorSubject<MapTrack[]>([]);

  @ViewChild(TrailsListComponent) trailsList?: TrailsListComponent;
  @ViewChild(MapComponent) map?: MapComponent;

  constructor(
    injector: Injector,
    private platform: Platform,
    public i18n: I18nService,
    private trackService: TrackService,
    private router: Router,
  ) {
    super(injector);
    this.whenVisible.subscribe(platform.resize, () => this.updateMode());
    this.visible$.subscribe(() => this.updateMode());
  }

  protected override initComponent(): void {
    this.updateMode();
  }

  protected override getComponentState() {
    return {trails: this.trails}
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.mapTrails$.next(this.trails);
    this.byStateAndVisible.subscribe(
      this.mapTrails$.pipe(
        switchMap(trails =>
          trails.length === 0 ? of([]) : combineLatest(
            trails.map(
              trail => trail.currentTrackUuid$.pipe(
                switchMap(trackUuid => this.trackService.getSimplifiedTrack$(trackUuid, trail.owner)),
                filter(track => !!track),
                map(track => ({trail, track: track!})),
              )
            )
          )
        ),
        debounceTimeExtended(1, 250)
      ),
      trailsAndTracks => {
        this.mapTracks$.next(this.mapTracksMapper.update(trailsAndTracks));
      }
    );
  }

  private mapTrails$ = new BehaviorSubject<Trail[]>([]);
  updateMapTracks(trailsAndTracks: {trail: Trail, track: TrackMetadataSnapshot | null}[]): void {
    this.mapTrails$.next(trailsAndTracks.map(t => t.trail));
  }

  setTab(tab: string): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.updateMode();
  }

  private updateMode(): void {
    if (!this.visible) {
      this.updateVisibility(false, false, false);
      return;
    }
    const w = this.platform.width();
    const h = this.platform.height();
    if (w >= 750 + 350) {
      this.mode = 'large list-two-cols';
      this.listMetadataClass = 'two-columns';
      this.trailSheetMode = 'none';
      this.isSmall = false;
      this.updateVisibility(true, true, false);
    } else if (w >= 700 + 175) {
      this.mode = 'large list-one-col';
      this.listMetadataClass = 'one-column';
      this.trailSheetMode = 'none';
      this.isSmall = false;
      this.updateVisibility(true, true, false);
    } else if (h > w) {
      this.mode = 'small vertical ' + this.tab;
      this.isSmall = true;
      this.listMetadataClass = w >= 350 ? 'two-columns' : 'one-column';
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
      this.listMetadataClass = w >= 350 ? 'two-columns' : 'one-column';
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
        child.invalidateSize();
      } else if (child instanceof TrailsListComponent) child.setVisible(listVisible);
      else if (child instanceof TrailOverviewComponent) child.setVisible(trailSheetVisible);
      else console.error('unexpected child', child);
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
  }

  private highlight(trail: Trail, highlight: boolean): void {
    const mapTrack = this.mapTracks$.value.find(mt => mt.trail?.uuid === trail.uuid && mt.trail?.owner === trail.owner);
    if (mapTrack) {
      mapTrack.color = highlight ? '#4040FF' : 'red';
      mapTrack.showDepartureAndArrivalAnchors(highlight);
    }
    this.trailsList?.setHighlighted(highlight ? trail : undefined);
    if (highlight && this.map) {
      if (mapTrack) {
        this.map.ensureVisible(mapTrack);
      }
    }
  }

  onTrailClickOnList(trail: Trail): void {
    this.toggleHighlightedTrail(trail);
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

}
