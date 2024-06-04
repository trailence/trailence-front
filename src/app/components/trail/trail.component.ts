import { Component, Injector, Input, ViewChild } from '@angular/core';
import { BehaviorSubject, Observable, map, mergeMap, of } from 'rxjs';
import { Trail } from 'src/app/model/trail';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { MapComponent } from '../map/map.component';
import { MapTrack } from '../map/track/map-track';
import { Track } from 'src/app/model/track';
import { TrackService } from 'src/app/services/database/track.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { Platform } from '@ionic/angular';
import { IonSegment, IonSegmentButton } from "@ionic/angular/standalone";
import { TrackMetadataComponent } from '../track-metadata/track-metadata.component';

@Component({
  selector: 'app-trail',
  templateUrl: './trail.component.html',
  styleUrls: ['./trail.component.scss'],
  standalone: true,
  imports: [IonSegmentButton, IonSegment,
    CommonModule,
    MapComponent,
    TrackMetadataComponent,
  ]
})
export class TrailComponent extends AbstractComponent {

  @Input() trail$!: Observable<Trail | null>;

  trail: Trail | null = null;
  tracks$ = new BehaviorSubject<Track[]>([]);
  mapTracks$ = new BehaviorSubject<MapTrack[]>([]);

  @ViewChild(MapComponent) map?: MapComponent;

  displayMode = 'large';
  tab = 'map';
  bottomSheetMode = 'none';

  constructor(
    injector: Injector,
    private trackService: TrackService,
    public i18n: I18nService,
    private platform: Platform,
  ) {
    super(injector);
  }

  protected override initComponent(): void {
    this.updateDisplay();
    this.whenVisible.subscribe(this.platform.resize, () => this.updateDisplay());
    this._visible$.subscribe(visible => {
      if (!visible && this.map) this.map.pause();
    });
    this.whenVisible.subscribe(
      this.trail$.pipe(
        mergeMap(trail => {
          if (!trail) return of({trail: null, track: undefined});
          return trail.currentTrackUuid$.pipe(
            mergeMap(uuid => this.trackService.getTrack$(uuid, trail.owner)),
            map(track => ({trail, track}))
          )
        })
      ),
      trailTrack => {
        this.trail = trailTrack?.trail || null;
        const tracks = [];
        if (trailTrack.track) tracks.push(trailTrack.track);
        this.tracks$.next(tracks);
        const mapTracks = [];
        if (trailTrack.trail && trailTrack.track) {
          const mapTrack = new MapTrack(trailTrack.trail, trailTrack.track, 'red', 1, false, this.i18n);
          mapTrack.showDepartureAndArrivalAnchors();
          mapTrack.showWayPointsAnchors();
          mapTracks.push(mapTrack);
        }
        this.mapTracks$.next(mapTracks);
      }
    );
  }

  private updateDisplay(): void {
    const w = this.platform.width();
    const h = this.platform.height();
    if (w >= 750 + 350) {
      this.displayMode = 'large';
    } else {
      this.displayMode = 'small';
    }
  }

  setTab(tab: string): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.updateDisplay();
  }

}
