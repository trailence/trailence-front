import { Component, Injector, Input, ViewChild } from '@angular/core';
import { BehaviorSubject, Observable, Subject, combineLatest, concat, debounceTime, filter, map, mergeMap, of } from 'rxjs';
import { Trail } from 'src/app/model/trail';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { MapComponent } from '../map/map.component';
import { MapTrack } from '../map/track/map-track';
import { Track } from 'src/app/model/track';
import { TrackService } from 'src/app/services/database/track.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { Platform } from '@ionic/angular';
import { IonSegment, IonSegmentButton, IonIcon, IonButton, IonText, IonTextarea } from "@ionic/angular/standalone";
import { TrackMetadataComponent } from '../track-metadata/track-metadata.component';
import { ElevationGraphComponent } from '../elevation-graph/elevation-graph.component';
import { MapTrackPointReference } from '../map/track/map-track-point-reference';
import { Point } from 'src/app/model/point';
import { ElevationGraphPointReference } from '../elevation-graph/elevation-graph-point-reference';
import { IconLabelButtonComponent } from '../icon-label-button/icon-label-button.component';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { Recording, TraceRecorderService } from 'src/app/services/trace-recorder/trace-recorder.service';

@Component({
  selector: 'app-trail',
  templateUrl: './trail.component.html',
  styleUrls: ['./trail.component.scss'],
  standalone: true,
  imports: [IonTextarea, IonText, IonButton, IonIcon, IonSegmentButton, IonSegment,
    CommonModule,
    MapComponent,
    TrackMetadataComponent,
    ElevationGraphComponent,
    IconLabelButtonComponent,
  ]
})
export class TrailComponent extends AbstractComponent {

  @Input() trail1$?: Observable<Trail | null>;
  @Input() trail2$?: Observable<Trail | null>;
  @Input() recording$?: Observable<Recording | null>;

  trail1: Trail | null = null;
  trail2: Trail | null = null;
  recording: Recording | null = null;
  tracks$ = new BehaviorSubject<Track[]>([]);
  mapTracks$ = new BehaviorSubject<MapTrack[]>([]);

  @ViewChild(MapComponent) map?: MapComponent;
  @ViewChild(ElevationGraphComponent) elevationGraph?: ElevationGraphComponent;

  displayMode = 'large';
  tab = 'map';
  bottomSheetOpen = false;
  bottomSheetTab = 'info';

  editable = false;
  edited$ = new Subject<boolean>();

  constructor(
    injector: Injector,
    private trackService: TrackService,
    public i18n: I18nService,
    private platform: Platform,
    private offlineMap: OfflineMapService,
    private auth: AuthService,
    private trailService: TrailService,
    private traceRecorder: TraceRecorderService,
  ) {
    super(injector);
  }

  protected override initComponent(): void {
    this.updateDisplay();
    this.whenVisible.subscribe(this.platform.resize, () => this.updateDisplay());
    this.visible$.subscribe(() => this.updateDisplay());
    setTimeout(() => this.updateDisplay(), 0);
  }

  protected override getComponentState() {
    return {
      trail1: this.trail1$,
      trail2: this.trail2$,
      recording: this.recording$,
    }
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.trail1 = null;
    this.trail2 = null;
    this.recording = null;
    this.tracks$.next([]);
    this.mapTracks$.next([]);
    this.byStateAndVisible.subscribe(
      combineLatest([this.trail$(this.trail1$), this.trail$(this.trail2$), this.recording$ || of(null)]),
      ([trail1, trail2, recording]) => {
        this.trail1 = trail1[0];
        this.trail2 = trail2[0];
        this.recording = recording;
        const tracks: Track[] = [];
        if (trail1[1]) {
          tracks.push(trail1[1]);
          if (trail2[1]) tracks.push(trail2[1]);
        }
        if (recording && !trail2[0]) {
          tracks.push(recording.track);
        }
        const mapTracks: MapTrack[] = [];
        if (trail1[2]) {
          mapTracks.push(trail1[2]);
          if (trail2[2]) mapTracks.push(trail2[2]);
        }
        if (recording && !trail2[0]) {
          const mapTrack = new MapTrack(recording.trail, recording.track, 'blue', 1, true, this.i18n);
          mapTrack.showDepartureAndArrivalAnchors();
          mapTrack.showArrowPath();
          mapTracks.push(mapTrack)
        }
        this.tracks$.next(tracks);
        this.mapTracks$.next(mapTracks);

        this.editable = !this.trail2 && !!this.trail1 && this.trail1.owner === this.auth.email;
      }
    );
    if (this.recording$)
      this.byStateAndVisible.subscribe(
        this.recording$.pipe(
          mergeMap(r => r ? concat(of(r), r.track.changes$.pipe(map(() => r))) : of(undefined)),
          map(r => r?.track.arrivalPoint),
        ),
        pt => {
          if (this.map) {
            if (pt)
              this.map.showLocation(pt.pos.lat, pt.pos.lng);
            else
              this.map.hideLocation();
          }
        }
      );
    else
      this.map?.hideLocation();
    this.byState.add(
      this.edited$.pipe(
        debounceTime(1000)
      ).subscribe(() => {
        if (this.editable)
          this.saveTrail();
      })
    )
  }

  private trail$(trail$?: Observable<Trail | null>): Observable<[Trail | null, Track | undefined, MapTrack | undefined]> {
    if (!trail$) return of(([null, undefined, undefined]) as [Trail | null, Track | undefined, MapTrack | undefined]);
    return trail$.pipe(
      mergeMap(trail => {
        if (!trail) return of(([null, undefined, undefined]) as [Trail | null, Track | undefined, MapTrack | undefined]);
        return trail.currentTrackUuid$.pipe(
          mergeMap(uuid => this.trackService.getFullTrack$(uuid, trail.owner)),
          map(track => {
            if (!track) return ([trail, undefined, undefined]) as [Trail | null, Track | undefined, MapTrack | undefined];
            const mapTrack = new MapTrack(trail, track, 'red', 1, false, this.i18n);
            mapTrack.showDepartureAndArrivalAnchors();
            mapTrack.showWayPointsAnchors();
            mapTrack.showArrowPath();
            return ([trail, track, mapTrack]) as [Trail | null, Track | undefined, MapTrack | undefined];
          })
        )
      })
    );
  }

  private updateDisplay(): void {
    const w = this.platform.width();
    const h = this.platform.height();
    if (w >= 750 + 350) {
      this.displayMode = 'large';
      this.updateVisibility(true, true);
    } else {
      this.displayMode = 'small';
      this.updateVisibility(this.tab === 'map', this.bottomSheetTab === 'elevation');
    }
  }

  private updateVisibility(mapVisible: boolean, graphVisible: boolean): void {
    this._children.forEach(child => {
      if (child instanceof MapComponent) child.setVisible(mapVisible);
      else if (child instanceof ElevationGraphComponent) child.setVisible(graphVisible);
      else if (child instanceof TrackMetadataComponent) {

      }
      else console.error('unexpected child', child);
    })
  }

  protected override _propagateVisible(visible: boolean): void {
    // no
  }

  setTab(tab: string): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.updateDisplay();
  }

  toggleBottomSheet(): void {
    this.bottomSheetOpen = !this.bottomSheetOpen;
    this.updateDisplay();
  }

  setBottomSheetTab(tab: string): void {
    if (tab === this.bottomSheetTab) return;
    this.bottomSheetTab = tab;
    this.updateDisplay();
  }

  private _hoverCursor: {pos: L.LatLngExpression}[] = [];

  private resetHover(): void {
    this._hoverCursor.forEach(cursor => {
      this.map?.cursors.removeCursor(cursor.pos);
    });
    this._hoverCursor = [];
  }

  mouseOverPointOnMap(event?: MapTrackPointReference) {
    this.resetHover();
    this.elevationGraph?.hideCursor();
    if (event) {
      const pt = event.point;
      const pos = pt instanceof Point ? pt.pos : pt;
      this.map?.cursors.addCursor(pos);
      this.elevationGraph?.showCursorForPosition(pos.lat, pos.lng);
      this._hoverCursor.push({pos});
    }
  }

  elevationGraphPointHover(references: ElevationGraphPointReference[]) {
    this.resetHover();
    references.forEach(pt => {
      const pos = pt.pos;
      this._hoverCursor.push({pos});
      this.map?.cursors.addCursor(pos);
    });
  }

  mouseClickOnMap(event?: MapTrackPointReference) {

  }


  goToDeparture(): void {
    if (this.tracks$.value.length === 0) return;
    const point = this.tracks$.value[0].departurePoint;
    if (!point) return;
    if (this.platform.is('capacitor')) {
      const link = document.createElement('A') as HTMLAnchorElement;
      link.style.position = 'fixed';
      link.style.top = '-10000px';
      link.style.left = '-10000px';
      link.href = 'geo:0,0?q=' + point.pos.lat + ',' + point.pos.lng;
      link.target = '_blank';
      document.documentElement.appendChild(link);
      link.click();
      document.documentElement.removeChild(link);
    } else {
      const link = document.createElement('A') as HTMLAnchorElement;
      link.style.position = 'fixed';
      link.style.top = '-10000px';
      link.style.left = '-10000px';
      link.target = '_blank';
      link.href = 'https://www.google.com/maps/dir/?api=1&dir_action=navigate&destination=' + point.pos.lat + ',' + point.pos.lng;
      document.documentElement.appendChild(link);
      link.click();
      document.documentElement.removeChild(link);
    }
  }

  downloadMap(): void {
    if (!this.map) return;
    const layer = this.map.tilesLayers.find(l => l.layer.name === 'osm');
    if (!layer) return;
    let bounds: L.LatLngBounds | undefined = undefined;
    this.mapTracks$.value.forEach(track => {
      const b = track.bounds
      if (b)
        if (!bounds) bounds = b; else bounds = bounds.extend(b);
    });
    if (!bounds) return;
    bounds = (bounds as L.LatLngBounds).pad(1);
    this.offlineMap.save(bounds, layer.tiles, this.map.crs, layer.layer);
  }

  descriptionChanged(text: string | null | undefined): void {
    text = text ?? '';
    if (this.trail1?.description !== text) {
      this.trail1!.description = text;
      this.edited$.next(true);
    }
  }

  startTrail(): void {
    this.traceRecorder.start(this.trail1!);
  }

  togglePauseRecording(): void {
    if (this.recording?.paused)
      this.traceRecorder.resume();
    else
      this.traceRecorder.pause();
  }

  stopRecording(): void {
    this.traceRecorder.stop(false).subscribe(); // TODO save
  }

  saveTrail(): void {
    if (this.trail1)
      this.trailService.update(this.trail1);
  }
}
