import { Component, Injector, Input, ViewChild } from '@angular/core';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { Platform } from '@ionic/angular';
import { Trail } from 'src/app/model/trail';
import { TrailsListComponent } from '../trails-list/trails-list.component';
import { BehaviorSubject, Observable, combineLatest, map, mergeMap, of } from 'rxjs';
import { IonSegment, IonSegmentButton } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MapComponent } from '../map/map.component';
import { MapTrack } from '../map/track/map-track';
import { TrackService } from 'src/app/services/database/track.service';
import { MapTrackPointReference } from '../map/track/map-track-point-reference';
import { TrailOverviewComponent } from '../trail-overview/trail-overview.component';
import { CommonModule } from '@angular/common';
import { debounceTimeExtended } from 'src/app/utils/rxjs-utils';

@Component({
  selector: 'app-trails-and-map',
  templateUrl: './trails-and-map.component.html',
  styleUrls: ['./trails-and-map.component.scss'],
  standalone: true,
  imports: [IonSegmentButton, IonSegment,
    TrailsListComponent, MapComponent, TrailOverviewComponent, CommonModule,
  ]
})
export class TrailsAndMapComponent extends AbstractComponent {

  @Input() viewId!: string;

  @Input() trails$?: Observable<Observable<Trail | null>[]>;
  @Input() collectionUuid?: string;

  mode =  '';
  listMetadataClass = 'two-columns';
  tab = 'map';
  trailSheetMode = 'none';
  trailSheetMetadataClass = 'two-columns';

  highlightedTrail?: Trail;
  mapTracks$ = new BehaviorSubject<MapTrack[]>([]);

  @ViewChild(TrailsListComponent) trailsList?: TrailsListComponent;
  @ViewChild(MapComponent) map?: MapComponent;

  constructor(
    injector: Injector,
    private platform: Platform,
    public i18n: I18nService,
    private trackService: TrackService,
  ) {
    super(injector);
    this.whenVisible.subscribe(platform.resize, () => this.updateMode());
    this._visible$.subscribe(visible => {
      if (!visible && this.map) this.map.pause();
    });
  }

  protected override initComponent(): void {
    this.updateMode();
  }

  protected override getComponentState() {
    return {trails$: this.trails$}
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.mapTracks$.next([]);
    if (!this.trails$) return;
    this.byStateAndVisible.subscribe(
      this.trails$.pipe(
        mergeMap(trails => trails.length === 0 ? of([]) : combineLatest(trails)),
        map(trails =>
          trails.filter(trail => !!trail)
          .map(trail => trail!.currentTrackUuid$.pipe(
            mergeMap(uuid => this.trackService.getTrack$(uuid, trail!.owner)),
            map(track => ({trail: trail!, track}))
          ))
        ),
        mergeMap(tracks => tracks.length === 0 ? of([]) : combineLatest(tracks)),
        debounceTimeExtended(0, 250, -1, (p,n) => p.length !== n.length),
        map(list =>
          list.filter(track => !!track.track)
          .map(track => new MapTrack(track.trail, track.track!, 'red', 4, false, this.i18n))
        )
      ),
      tracks => this.mapTracks$.next(tracks)
    );
  }

  setTab(tab: string): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.updateMode();
  }

  private updateMode(): void {
    const w = this.platform.width();
    const h = this.platform.height();
    if (w >= 750 + 350) {
      this.mode = 'large list-two-cols';
      this.listMetadataClass = 'two-columns';
      this.map?.resume();
      this.trailSheetMode = 'none';
    } else if (w >= 700 + 175) {
      this.mode = 'large list-one-col';
      this.listMetadataClass = 'one-column';
      this.map?.resume();
      this.trailSheetMode = 'none';
    } else if (h > w) {
      this.mode = 'small vertical ' + this.tab;
      this.listMetadataClass = w >= 350 ? 'two-columns' : 'one-column';
      if (this.tab === 'map') {
        this.map?.resume();
        this.trailSheetMode = 'bottom';
        if (w < 500 + 36) this.trailSheetMode += ' two-rows';
        this.trailSheetMetadataClass = 'two-columns';
      } else {
        this.map?.pause();
        this.trailSheetMode = 'none';
      }
    } else {
      this.mode = 'small horizontal ' + this.tab;
      this.listMetadataClass = w >= 350 ? 'two-columns' : 'one-column';
      if (this.tab === 'map') {
        this.map?.resume();
        if (w >= 750 || h <= 400) {
          this.trailSheetMode = 'left';
          this.trailSheetMetadataClass = 'one-column';
        } else {
          this.trailSheetMode = 'bottom';
          if (w < 500 + 36) this.trailSheetMode += ' two-rows';
          this.trailSheetMetadataClass = 'tiles';
        }
      } else {
        this.map?.pause();
        this.trailSheetMode = 'none';
      }
    }
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
    const mapTrack = this.mapTracks$.value.find(mt => mt.trail === trail);
    if (mapTrack) {
      mapTrack.color = highlight ? '#4040FF' : 'red';
      mapTrack.showDepartureAndArrivalAnchors(highlight);
    }
    this.trailsList?.setHighlighted(highlight ? trail : undefined);
    if (highlight && this.map) {
      const mapTrack = this.mapTracks$.value.find(mt => mt.trail === trail);
      if (mapTrack) {
        this.map.ensureVisible(mapTrack);
      }
    }
  }

  onTrailClickOnList(trail: Trail): void {
    this.toggleHighlightedTrail(trail);
  }

  onTrailClickOnMap(event: MapTrackPointReference | undefined): void {
    if (event?.track.trail) {
      this.toggleHighlightedTrail(event.track.trail);
    } else if (this.highlightedTrail) {
      this.toggleHighlightedTrail(this.highlightedTrail);
    }
  }

}
