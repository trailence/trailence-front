import { ChangeDetectorRef, Component, Injector, Input, ViewChild } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, concat, debounceTime, filter, first, from, map, of, switchMap } from 'rxjs';
import { Trail } from 'src/app/model/trail';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { MapComponent } from '../map/map.component';
import { MapTrack } from '../map/track/map-track';
import { ComputedWayPoint, Track } from 'src/app/model/track';
import { TrackService } from 'src/app/services/database/track.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { IonSegment, IonSegmentButton, IonIcon, IonButton, IonText, IonTextarea, IonInput, IonCheckbox, AlertController, IonSpinner } from "@ionic/angular/standalone";
import { TrackMetadataComponent } from '../track-metadata/track-metadata.component';
import { ElevationGraphComponent } from '../elevation-graph/elevation-graph.component';
import { MapTrackPointReference } from '../map/track/map-track-point-reference';
import { ElevationGraphPointReference } from '../elevation-graph/elevation-graph-events';
import { IconLabelButtonComponent } from '../icon-label-button/icon-label-button.component';
import { AuthService } from 'src/app/services/auth/auth.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { Recording, TraceRecorderService } from 'src/app/services/trace-recorder/trace-recorder.service';
import { TrailHoverCursor } from './hover-cursor';
import { TrailPathSelection } from './path-selection';
import { MapLayerSelectionComponent } from '../map-layer-selection/map-layer-selection.component';
import { Router } from '@angular/router';
import { MapAnchor } from '../map/markers/map-anchor';
import { anchorArrivalBorderColor, anchorArrivalFillColor, anchorArrivalTextColor, anchorBorderColor, anchorBreakBorderColor, anchorBreakFillColor, anchorBreakTextColor, anchorDepartureBorderColor, anchorDepartureFillColor, anchorDepartureTextColor, anchorFillColor, anchorTextColor, MapTrackWayPoints } from '../map/track/map-track-way-points';
import { TrailMenuService } from 'src/app/services/database/trail-menu.service';
import { WayPoint } from 'src/app/model/way-point';
import { TagService } from 'src/app/services/database/tag.service';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { PhotoService } from 'src/app/services/database/photo.service';
import { Photo } from 'src/app/model/photo';
import { PhotoComponent } from '../photo/photo.component';
import { PhotosPopupComponent } from '../photos-popup/photos-popup.component';
import { BrowserService } from 'src/app/services/browser/browser.service';
import { Arrays } from 'src/app/utils/arrays';
import { MapPhoto } from '../map/markers/map-photo';
import { BinaryContent } from 'src/app/utils/binary-content';
import { TrackUtils } from 'src/app/utils/track-utils';
import * as L from 'leaflet';
import { ImageUtils } from 'src/app/utils/image-utils';

@Component({
  selector: 'app-trail',
  templateUrl: './trail.component.html',
  styleUrls: ['./trail.component.scss'],
  standalone: true,
  imports: [IonSpinner, IonCheckbox, IonInput, IonTextarea, IonText, IonButton, IonIcon, IonSegmentButton, IonSegment,
    CommonModule,
    MapComponent,
    TrackMetadataComponent,
    ElevationGraphComponent,
    IconLabelButtonComponent,
    MapLayerSelectionComponent,
    PhotoComponent,
    PhotosPopupComponent,
  ]
})
export class TrailComponent extends AbstractComponent {

  @Input() trail1$?: Observable<Trail | null>;
  @Input() trail2$?: Observable<Trail | null>;
  @Input() recording$?: Observable<Recording | null>;

  showOriginal$ = new BehaviorSubject<boolean>(false);
  showBreaks$ = new BehaviorSubject<boolean>(false);
  showPhotos$ = new BehaviorSubject<boolean>(false);

  trail1: Trail | null = null;
  trail2: Trail | null = null;
  recording: Recording | null = null;
  tracks$ = new BehaviorSubject<Track[]>([]);
  toolsBaseTrack$ = new BehaviorSubject<Track | undefined>(undefined);
  toolsModifiedTrack$ = new BehaviorSubject<Track | undefined>(undefined);
  toolsFocusTrack$ = new BehaviorSubject<Track | undefined>(undefined);
  mapTracks$ = new BehaviorSubject<MapTrack[]>([]);
  wayPoints: ComputedWayPoint[] = [];
  wayPointsTrack: Track | undefined;
  tagsNames: string[] | undefined;
  photos: Photo[] | undefined;

  @ViewChild(MapComponent) map?: MapComponent;
  @ViewChild(ElevationGraphComponent) elevationGraph?: ElevationGraphComponent;

  displayMode = 'loading';
  tab = 'map';
  bottomSheetOpen = true;
  bottomSheetTab = 'info';
  isSmall = false;

  editable = false;

  hover: TrailHoverCursor;
  pathSelection: TrailPathSelection;
  previousFocus: Track | undefined = undefined;

  private _lockForDescription?: () => void;
  editingDescription = false;
  @ViewChild('descriptionEditor') descriptionEditor?: IonTextarea;

  constructor(
    injector: Injector,
    private trackService: TrackService,
    public i18n: I18nService,
    private browser: BrowserService,
    private auth: AuthService,
    public trailService: TrailService,
    private traceRecorder: TraceRecorderService,
    public trailMenuService: TrailMenuService,
    private tagService: TagService,
    private photoService: PhotoService,
    private changesDetector: ChangeDetectorRef,
  ) {
    super(injector);
    this.hover = new TrailHoverCursor(this);
    this.pathSelection = new TrailPathSelection(this, injector);
  }

  protected override initComponent(): void {
    this.updateDisplay();
    this.whenVisible.subscribe(this.browser.resize$, () => this.updateDisplay());
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
    if (this._lockForDescription) {
      this._lockForDescription();
      this._lockForDescription = undefined;
    }
    this.editingDescription = false;
    this.trail1 = null;
    this.trail2 = null;
    this.recording = null;
    this.tagsNames = undefined;
    this.photos = undefined;
    this.tracks$.next([]);
    this.mapTracks$.next([]);
    const recording$ = this.recording$ ? combineLatest([this.recording$, this.showOriginal$]).pipe(map(([r,s]) => r ? {recording: r, track: s ? r.rawTrack : r.track} : null)) : of(null);
    this.byStateAndVisible.subscribe(
      combineLatest([this.trail$(this.trail1$), this.trail$(this.trail2$), recording$, this.toolsBaseTrack$, this.toolsModifiedTrack$, this.toolsFocusTrack$, this.showBreaks$]).pipe(debounceTime(1)),
      ([trail1, trail2, recordingWithTrack, toolsBaseTrack, toolsModifiedTrack, toolsFocusTrack, showBreaks]) => {
        if (this.trail1 !== trail1[0]) {
          if (this._lockForDescription) {
            this._lockForDescription();
            this._lockForDescription = undefined;
            this.editingDescription = false;
          }
        }
        this.trail1 = trail1[0];
        this.trail2 = trail2[0];
        this.recording = recordingWithTrack ? recordingWithTrack.recording : null;
        const tracks: Track[] = [];
        const mapTracks: MapTrack[] = [];

        if (toolsBaseTrack && !recordingWithTrack && !trail2[0]) {
          tracks.push(toolsBaseTrack);
          const mapTrack = new MapTrack(undefined, toolsBaseTrack, 'red', 1, false, this.i18n);
          mapTrack.showArrowPath();
          if (!toolsModifiedTrack) {
            mapTrack.showDepartureAndArrivalAnchors();
            mapTrack.showWayPointsAnchors();
            mapTrack.showBreaksAnchors(showBreaks);
          }
          mapTracks.push(mapTrack);
        }
        if (trail1[1] && !toolsBaseTrack) {
          tracks.push(trail1[1]);
          if (trail1[2]) {
            mapTracks.push(trail1[2]);
            if (!toolsModifiedTrack) {
              trail1[2].showDepartureAndArrivalAnchors();
              trail1[2].showWayPointsAnchors();
              trail1[2].showBreaksAnchors(showBreaks);
            }
          }
          if (trail2[1]) {
            tracks.push(trail2[1]);
            if (trail2[2]) {
              trail2[2].color = 'blue';
              mapTracks.push(trail2[2]);
              trail2[2].showDepartureAndArrivalAnchors();
              trail2[2].showWayPointsAnchors();
              trail2[2].showBreaksAnchors(showBreaks);
            }
          }
        }

        if (recordingWithTrack && !trail2[0]) {
          tracks.push(recordingWithTrack.track);
          const mapTrack = new MapTrack(recordingWithTrack.recording.trail, recordingWithTrack.track, 'blue', 1, true, this.i18n);
          mapTrack.showDepartureAndArrivalAnchors();
          mapTrack.showArrowPath();
          mapTracks.push(mapTrack)
        }

        if (!recordingWithTrack && !trail2[0]) {
          if (toolsModifiedTrack) {
            tracks.push(toolsModifiedTrack);
            const mapTrack = new MapTrack(undefined, toolsModifiedTrack, 'blue', 1, false, this.i18n);
            mapTrack.showDepartureAndArrivalAnchors();
            mapTrack.showWayPointsAnchors();
            mapTrack.showBreaksAnchors(showBreaks);
            mapTracks.push(mapTrack);
          }
          if (toolsFocusTrack !== this.previousFocus) {
            this.previousFocus = toolsFocusTrack;
            if (toolsFocusTrack) {
              let bounds = toolsFocusTrack.metadata.bounds;
              if (bounds) {
                bounds = bounds.pad(0.05);
                this.map?.centerAndZoomOn(bounds);
              }
            }
          }
          if (toolsFocusTrack) {
            tracks.push(toolsFocusTrack);
            mapTracks.push(new MapTrack(undefined, toolsFocusTrack, '#A08000C0', 1, false, this.i18n));
          }
        }

        this.pathSelection.updatedTracks(tracks);
        mapTracks.push(...this.pathSelection.mapTracks$.value);
        this.tracks$.next(tracks);
        this.mapTracks$.next(mapTracks);

        this.editable = !this.trail2 && !!this.trail1 && this.trail1.owner === this.auth.email;
        if (toolsModifiedTrack)
          this.elevationGraph?.resetChart();
        this.changesDetector.detectChanges();
      }, true
    );

    this.byStateAndVisible.subscribe(
      combineLatest([this.toolsModifiedTrack$, this.tracks$]).pipe(
        map(([modified, tracks]) => modified || (tracks.length > 0 ? tracks[0] : undefined)),
        switchMap(track => { this.wayPointsTrack = track; return track ? track.computedWayPoints$ : of([]); })
      ),
      wayPoints => {
        if (this._highlightedWayPoint) this.unhighlightWayPoint(this._highlightedWayPoint, true);
        this.wayPoints = wayPoints;
        this.changesDetector.detectChanges();
      }, true
    );

    if (this.trail1$) {
      this.byStateAndVisible.subscribe(
        combineLatest([this.trail1$, this.trail2$ || of(null)]).pipe(
          switchMap(([trail, trail2]) => !trail2 && trail && trail.owner === this.auth.email ? this.tagService.getTrailTagsFullNames$(trail.uuid).pipe(debounceTimeExtended(0, 100)) : of(undefined))
        ),
        names => {
          if (this.tagsNames && names && Arrays.sameContent(this.tagsNames, names)) return;
          this.tagsNames = names;
          this.changesDetector.detectChanges();
        }, true
      );
      this.byStateAndVisible.subscribe(
        combineLatest([this.trail1$, this.trail2$ || of(null)]).pipe(
          switchMap(([trail1, trail2]) => trail1 && !trail2 ? this.photoService.getTrailPhotos(trail1) : of(undefined))
        ),
        photos => {
          if (photos === undefined)
            this.photos = undefined;
          else {
            this.photos = photos.sort((p1,p2) => {
              if (p1.isCover) return -1;
              if (p2.isCover) return 1;
              return p1.index - p2.index;
            });
          }
          this.changesDetector.detectChanges();
        }, true
      );
      let photosOnMap = new Map<string, L.Marker>();
      let photosByKey = new Map<string, Photo[]>();
      let trackUuid: string | undefined = undefined;
      let dateToPoint = new Map<number, L.LatLngExpression | null>();
      this.byStateAndVisible.subscribe(
        combineLatest([this.trail1$, this.trail2$ || of(null), this.showPhotos$]).pipe(
          switchMap(([trail1, trail2, showPhotos]) => {
            if (!trail1 || trail2 || !showPhotos) return of([]);
            return this.photoService.getTrailPhotos(trail1).pipe(
              switchMap(photos => {
                const withPos = photos.filter(p => p.latitude !== undefined && p.longitude !== undefined).map(p => ({photo:p, point: {lat: p.latitude!, lng: p.longitude!} as L.LatLngExpression}));
                const withDateOnly = photos.filter(p => (p.latitude === undefined || p.longitude === undefined) && p.dateTaken !== undefined);
                if (withDateOnly.length > 0) {
                  // we need the track to get a position
                  return this.showOriginal$.pipe(
                    switchMap(showOriginal => showOriginal ? trail1.originalTrackUuid$ : trail1.currentTrackUuid$),
                    switchMap(trackUuid => this.trackService.getFullTrack$(trackUuid, trail1.owner)),
                    map(track => {
                      if (!track) return [];
                      if (track.uuid !== trackUuid) {
                        trackUuid = track.uuid;
                        dateToPoint.clear();
                      }
                      return withDateOnly.map(photo => {
                        const date = photo.dateTaken!;
                        let point: L.LatLngExpression | null | undefined = dateToPoint.get(date);
                        if (point === undefined) {
                          const closest = TrackUtils.findClosestPointForTime(track, date);
                          point = closest ? {lat: closest.pos.lat, lng: closest.pos.lng} : null;
                          dateToPoint.set(date, point);
                        }
                        return {photo, point};
                      })
                      .filter(p => !!p.point) as {photo: Photo, point: L.LatLngExpression}[];
                    }),
                    map(result => [...result, ...withPos])
                  );
                }
                return of(withPos);
              }),
              map(photos => {
                // sort and keep only one if distance is < 15 meters
                const photosWithPoint = photos.sort((p1,p2) => p1.photo.index - p2.photo.index).map(p => ({photos: [p.photo], point: p.point}));
                for (let i = 1; i < photosWithPoint.length; ++i) {
                  const point = photosWithPoint[i].point;
                  let found = false;
                  for (let j = 0; j < i; ++j) {
                    const p = photosWithPoint[j].point;
                    if (L.latLng(p).distanceTo(point) < 15) {
                      photosWithPoint[j].photos.push(...photosWithPoint[i].photos);
                      found = true;
                      break;
                    }
                  }
                  if (found) {
                    photosWithPoint.splice(i, 1);
                    i--;
                  }
                }
                return photosWithPoint;
              }),
              switchMap(photosWithPoint => {
                if (photosWithPoint.length === 0) return of([]);
                const markers$: Observable<{key: string, marker: L.Marker, alreadyOnMap: boolean}>[] = [];
                photosByKey.clear();
                for (const p of photosWithPoint) {
                  const key = p.photos[0].owner + '#' + p.photos[0].uuid + '#' + p.photos.length;
                  photosByKey.set(key, p.photos);
                  let marker = photosOnMap.get(key);
                  if (marker) {
                    markers$.push(of({key, marker, alreadyOnMap: true}));
                    photosOnMap.delete(key);
                  } else {
                    markers$.push(this.photoService.getFile$(p.photos[0].owner, p.photos[0].uuid).pipe(
                      switchMap(blob => from(ImageUtils.convertToJpeg(blob, 75, 75, 0.7))),
                      switchMap(jpeg => from(new BinaryContent(jpeg.blob).toBase64()).pipe(
                        map(base64 => {
                          const marker = MapPhoto.create(p.point, base64, jpeg.width, jpeg.height, p.photos.length > 1 ? '' + p.photos.length : undefined);
                          marker.addEventListener('click', () => {
                            this.photoService.openSliderPopup(photosByKey.get(key)!, 0);
                          });
                          return {key, marker, alreadyOnMap: false};
                        }),
                      )),
                    ));
                  }
                }
                return combineLatest(markers$);
              }),
            );
          }),
        ),
        result => {
          if (!this.map) return;
          for (const marker of photosOnMap.values()) this.map.removeFromMap(marker);
          photosOnMap.clear();
          for (const element of result) {
            photosOnMap.set(element.key, element.marker);
            if (!element.alreadyOnMap) this.map.addToMap(element.marker);
          }
        }, true
      );
    }

    if (this.recording$)
      this.byStateAndVisible.subscribe(
        this.recording$.pipe(
          switchMap(r => r ? concat(of(r), r.track.changes$.pipe(map(() => r))) : of(undefined)),
          debounceTime(10),
        ),
        r => {
          const pt = r?.track.arrivalPoint;
          if (pt && this.elevationGraph) {
            this.elevationGraph.updateRecording(r.track);
          }
        }, true
      );
  }

  private trail$(trail$?: Observable<Trail | null>): Observable<[Trail | null, Track | undefined, MapTrack | undefined]> {
    if (!trail$) return of(([null, undefined, undefined]) as [Trail | null, Track | undefined, MapTrack | undefined]);
    return trail$.pipe(
      switchMap(trail => {
        if (!trail) return of(([null, undefined, undefined]) as [Trail | null, Track | undefined, MapTrack | undefined]);
        return this.showOriginal$.pipe(
          switchMap(original => {
            const uuid$ = original ? trail.originalTrackUuid$ : trail.currentTrackUuid$;
            return uuid$.pipe(
              switchMap(uuid => this.trackService.getFullTrack$(uuid, trail.owner)),
              map(track => {
                if (!track) return ([trail, undefined, undefined]) as [Trail | null, Track | undefined, MapTrack | undefined];
                const mapTrack = new MapTrack(trail, track, 'red', 1, false, this.i18n);
                mapTrack.showArrowPath();
                return ([trail, track, mapTrack]) as [Trail | null, Track | undefined, MapTrack | undefined];
              })
            );
          })
        )
      })
    );
  }

  private updateDisplay(): void {
    if (!this.visible) {
      this.updateVisibility(false, false);
      return;
    }
    const w = this.browser.width;
    const h = this.browser.height;
    if (w >= 750 + 350) {
      this.displayMode = 'large';
      this.isSmall = false;
      this.updateVisibility(true, this.bottomSheetOpen);
    } else {
      this.displayMode = h > 500 || w < 500 ? 'small' : 'small small-height bottom-sheet-tab-open-' + this.bottomSheetTab;
      this.isSmall = true;
      this.updateVisibility(this.tab === 'map', this.bottomSheetTab === 'elevation');
    }
  }

  private updateVisibility(mapVisible: boolean, graphVisible: boolean): void {
    this._children$.value.forEach(child => {
      if (child instanceof MapComponent) child.setVisible(mapVisible);
      else if (child instanceof ElevationGraphComponent) child.setVisible(graphVisible);
      else if (child instanceof TrackMetadataComponent) {
        // nothing
      } else if (this.editToolsComponent && child instanceof this.editToolsComponent) {
        child.setVisible(true);
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
    setTimeout(() => this.map?.invalidateSize(), 500);
  }

  setBottomSheetTab(tab: string): void {
    if (tab === this.bottomSheetTab) return;
    this.bottomSheetTab = tab;
    this.updateDisplay();
  }


  mouseOverPointOnMap(event: MapTrackPointReference[]) {
    this.hover.mouseOverPointOnMap(MapTrackPointReference.closest(event));
  }

  elevationGraphPointHover(references: ElevationGraphPointReference[]) {
    this.hover.elevationGraphPointHover(references);
  }

  mouseClickOnMap(event: MapTrackPointReference[]) {
    // nothing so far
  }

  openPhotos(): void {
    this.photoService.openPopupForTrail(this.trail1!.owner, this.trail1!.uuid);
  }

  openSlider(): void {
    if (!this.photos || this.photos.length === 0)
      this.openPhotos();
    else
      this.photoService.openSliderPopup(this.photos!, 0);
  }

  goToDeparture(): void {
    if (this.trail1)
      this.trailMenuService.goToDeparture(this.trail1);
  }

  downloadMap(): void {
    if (this.trail1)
      this.trailMenuService.openDownloadMap([this.trail1]);
  }

  startTrail(): void {
    this.traceRecorder.start(this.trail1!);
  }

  togglePauseRecording(withConfirmation: boolean = false): void {
    if (withConfirmation) {
      this.injector.get(AlertController).create({
        header: this.recording?.paused ? this.i18n.texts.trace_recorder.resume : this.i18n.texts.trace_recorder.pause,
        message: this.recording?.paused ? this.i18n.texts.trace_recorder.confirm_popup.resume_message : this.i18n.texts.trace_recorder.confirm_popup.pause_message,
        buttons: [
          {
            text: this.i18n.texts.buttons.confirm,
            role: 'confirm',
            handler: () => {
              if (this.recording?.paused)
                this.traceRecorder.resume();
              else
                this.traceRecorder.pause();
              this.injector.get(AlertController).dismiss();
            }
          }, {
            text: this.i18n.texts.buttons.cancel,
            role: 'cancel',
            handler: () => {
              this.injector.get(AlertController).dismiss();
            }
          }
        ]
      }).then(p => {
        p.present();
        setTimeout(() => {
          if ((p as any).presented) p.dismiss();
        }, 10000);
      });
    } else {
      if (this.recording?.paused)
        this.traceRecorder.resume();
      else
        this.traceRecorder.pause();
    }
  }

  stopRecording(withConfirmation: boolean = false): void {
    if (withConfirmation) {
      this.injector.get(AlertController).create({
        header: this.i18n.texts.trace_recorder.stop,
        message: this.i18n.texts.trace_recorder.confirm_popup.stop_message,
        buttons: [
          {
            text: this.i18n.texts.buttons.confirm,
            role: 'confirm',
            handler: () => {
              this.traceRecorder.stop(true).pipe(filter(trail => !!trail), first())
              .subscribe(trail => this.injector.get(Router).navigateByUrl('/trail/' + trail!.owner + '/' + trail!.uuid));
              this.injector.get(AlertController).dismiss();
            }
          }, {
            text: this.i18n.texts.buttons.cancel,
            role: 'cancel',
            handler: () => {
              this.injector.get(AlertController).dismiss();
            }
          }
        ]
      }).then(p => {
        p.present();
        setTimeout(() => {
          if ((p as any).presented) p.dismiss();
        }, 10000);
      });
    } else {
      this.traceRecorder.stop(true).pipe(filter(trail => !!trail), first())
      .subscribe(trail => this.injector.get(Router).navigateByUrl('/trail/' + trail!.owner + '/' + trail!.uuid));
    }
  }

  startEditDescription(): void {
    if (!this.trail1) return;
    if (this._lockForDescription) {
      this._lockForDescription();
      this._lockForDescription = undefined;
    }
    this.trailService.lock(this.trail1.uuid, this.trail1.owner, (locked, unlock) => {
      if (!locked) return;
      this._lockForDescription = unlock;
      this.editingDescription = true;
      this.changesDetector.detectChanges();
      setTimeout(() => {
        if (this.descriptionEditor) this.descriptionEditor.setFocus();
      }, 0);
    });
  }

  endEditDescription(text: string | null | undefined): void {
    text = text ?? '';
    this.editingDescription = false;
    if (this.trail1 && this.trail1.description !== text && this._lockForDescription) {
      this.trail1.description = text;
      this.trailService.update(this.trail1, () => {
        if (this._lockForDescription) {
          this._lockForDescription();
          this._lockForDescription = undefined;
        }
      });
    }
  }

  getDepartureAndArrival(waypoints: ComputedWayPoint[]): ComputedWayPoint | undefined {
    return waypoints.find(wp => wp.isDeparture && wp.isArrival);
  }

  waypointImg(wp: ComputedWayPoint, isArrival: boolean): string {
    if (isArrival)
      return MapAnchor.createDataIcon(anchorArrivalBorderColor, this.i18n.texts.way_points.A, anchorArrivalTextColor, anchorArrivalFillColor);
    if (wp.isDeparture)
      return MapAnchor.createDataIcon(anchorDepartureBorderColor, this.i18n.texts.way_points.D, anchorDepartureTextColor, anchorDepartureFillColor);
    if (wp.breakPoint)
      return MapAnchor.createDataIcon(anchorBreakBorderColor, MapTrackWayPoints.breakPointText(wp.breakPoint), anchorBreakTextColor, anchorBreakFillColor);
    return MapAnchor.createDataIcon(anchorBorderColor, '' + wp.index, anchorTextColor, anchorFillColor);
  }

  removeWayPoint(wp: ComputedWayPoint): void {
    if (!this.wayPointsTrack) return;
    const index = this.wayPointsTrack.wayPoints.indexOf(wp.wayPoint);
    if (index >= 0) {
      this.editToolsComponentInstance.modify().subscribe((track: Track) => {
        track.removeWayPoint(track.wayPoints[index]);
      });
    }
  }

  wayPointDescriptionChanged(wp: WayPoint, description: string): void {
    if (!this.wayPointsTrack) return;
    const index = this.wayPointsTrack.wayPoints.indexOf(wp);
    this.editToolsComponentInstance.modify().subscribe((track: Track) => {
      if (index >= 0) {
        track.wayPoints[index].description = description.trim();
      } else if (description.trim().length > 0) {
        const twp = new WayPoint(wp.point, '', description.trim());
        track.appendWayPoint(twp);
      }
    });
  }

  wayPointNameChanged(wp: WayPoint, name: string): void {
    if (!this.wayPointsTrack) return;
    const index = this.wayPointsTrack.wayPoints.indexOf(wp);
    this.editToolsComponentInstance.modify().subscribe((track: Track) => {
      if (index >= 0) {
        track.wayPoints[index].name = name.trim();
      } else if (name.trim().length > 0) {
        const twp = new WayPoint(wp.point, name.trim(), '');
        track.appendWayPoint(twp);
      }
    });
  }

  _highlightedWayPoint?: ComputedWayPoint;
  private _highlightedWayPointFromClick = false;

  highlightWayPoint(wp: ComputedWayPoint, click: boolean): void {
    if (this._highlightedWayPoint === wp) {
      if (click) this._highlightedWayPointFromClick = true;
      return;
    }
    if (!click && this._highlightedWayPointFromClick) return;
    if (this._highlightedWayPoint) {
      this.unhighlightWayPoint(this._highlightedWayPoint, true);
    }
    this._highlightedWayPoint = wp;
    this._highlightedWayPointFromClick = click;
    const mapTrack = this.mapTracks$.value.find(mt => mt.track === this.wayPointsTrack);
    mapTrack?.highlightWayPoint(wp);
  }

  unhighlightWayPoint(wp: ComputedWayPoint, force: boolean): void {
    if (this._highlightedWayPoint === wp && (force || !this._highlightedWayPointFromClick)) {
      this._highlightedWayPoint = undefined;
      this._highlightedWayPointFromClick = false;
      const mapTrack = this.mapTracks$.value.find(mt => mt.track === this.wayPointsTrack);
      mapTrack?.unhighlightWayPoint(wp);
    }
  }

  toogleHighlightWayPoint(wp: ComputedWayPoint): void {
    if (this._highlightedWayPoint === wp && this._highlightedWayPointFromClick) this.unhighlightWayPoint(wp, true);
    else this.highlightWayPoint(wp, true);
  }

  openLocationDialog(): void {
    if (this.trail2 || !this.trail1 || !this.editable) return;
    this.trailMenuService.openLocationPopup(this.trail1);
  }

  canEdit(): boolean {
    if (this.editToolsComponent) return false;
    if (this.trail2) return false;
    if (this.trail1?.owner !== this.auth.email) return false;
    if (this.recording) return false;
    return this.browser.width >= 1500 && this.browser.height >= 500;
  }

  editToolsComponent: any;
  editToolsInputs: any;
  editToolsComponentInstance: any;

  public async enableEditTools() {
    if (this.editToolsComponent) return;
    if (this.showOriginal$.value) this.showOriginal$.next(false);
    const module = await import('./edit-tools/edit-tools.component');
    this.editToolsComponent = module.EditToolsComponent;
    this.editToolsInputs = {
      trail: this.trail1,
      baseTrack$: this.toolsBaseTrack$,
      modifiedTrack$: this.toolsModifiedTrack$,
      focusTrack$: this.toolsFocusTrack$,
      map: this.map!,
      getMe: (me: any) => { this.editToolsComponentInstance = me; },
      close: () => {
        this.editToolsComponent = undefined;
        this.editToolsInputs = undefined;
        this.toolsModifiedTrack$.next(undefined);
        this.toolsBaseTrack$.next(undefined);
        this.toolsFocusTrack$.next(undefined);
        setTimeout(() => {
          this._children$.value.find(child => child instanceof MapComponent)?.invalidateSize();
          this._children$.value.find(child => child instanceof ElevationGraphComponent)?.resetChart();
        }, 0);
      }
    };
    this.changesDetector.detectChanges();
    setTimeout(() => {
      this._children$.value.find(child => child instanceof MapComponent)?.invalidateSize();
      this._children$.value.find(child => child instanceof ElevationGraphComponent)?.resetChart();
    }, 0);
  }

}
