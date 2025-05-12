import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, Input, ViewChild } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, concat, debounceTime, filter, first, from, map, of, skip, switchMap, take } from 'rxjs';
import { Trail } from 'src/app/model/trail';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { MapComponent } from '../map/map.component';
import { MapTrack } from '../map/track/map-track';
import { ComputedWayPoint, Track } from 'src/app/model/track';
import { TrackService } from 'src/app/services/database/track.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { IonSegment, IonSegmentButton, IonIcon, IonButton, IonTextarea, IonInput, IonCheckbox, AlertController, IonSpinner } from "@ionic/angular/standalone";
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
import { Router } from '@angular/router';
import { MapAnchor } from '../map/markers/map-anchor';
import { anchorArrivalBorderColor, anchorArrivalFillColor, anchorArrivalTextColor, anchorBorderColor, anchorBreakBorderColor, anchorBreakFillColor, anchorBreakTextColor, anchorDepartureBorderColor, anchorDepartureFillColor, anchorDepartureTextColor, anchorFillColor, anchorTextColor, MapTrackWayPoints } from '../map/track/map-track-way-points';
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
import L from 'leaflet';
import { ImageUtils } from 'src/app/utils/image-utils';
import { Console } from 'src/app/utils/console';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { estimateSimilarity } from 'src/app/services/track-edition/path-analysis/similarity';
import { I18nPipe } from 'src/app/services/i18n/i18n-string';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { TrailCollectionType } from 'src/app/model/dto/trail-collection';

@Component({
    selector: 'app-trail',
    templateUrl: './trail.component.html',
    styleUrls: ['./trail.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        IonSpinner,
        IonCheckbox,
        IonInput,
        IonTextarea,
        IonButton,
        IonIcon,
        IonSegmentButton,
        IonSegment,
        CommonModule,
        MapComponent,
        TrackMetadataComponent,
        ElevationGraphComponent,
        IconLabelButtonComponent,
        PhotoComponent,
        PhotosPopupComponent,
        I18nPipe,
    ]
})
export class TrailComponent extends AbstractComponent {

  @Input() trail1$?: Observable<Trail | null>;
  @Input() trail2$?: Observable<Trail | null>;
  @Input() recording$?: Observable<Recording | null>;
  @Input() tab = 'map';

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
  toolsHideBaseTrack$ = new BehaviorSubject<boolean>(false);
  mapTracks$ = new BehaviorSubject<MapTrack[]>([]);
  wayPoints: ComputedWayPoint[] = [];
  wayPointsTrack: Track | undefined;
  tagsNames1: string[] | undefined;
  tagsNames2: string[] | undefined;
  photos: Photo[] | undefined;
  elevationTrack1?: Track;
  elevationTrack2?: Track;

  @ViewChild(MapComponent) map?: MapComponent;
  @ViewChild(ElevationGraphComponent)
  set elevationGraph(child: ElevationGraphComponent | undefined) {
    this.elevationGraph$.next(child ?? undefined);
  }
  get elevationGraph() {
    return this.elevationGraph$.value;
  }

  elevationGraph$ = new BehaviorSubject<ElevationGraphComponent | undefined>(undefined);

  displayMode = 'loading';
  bottomSheetOpen = true;
  bottomSheetTab = 'info';
  isSmall = false;

  editable = false;

  hover: TrailHoverCursor;
  pathSelection: TrailPathSelection;
  previousFocus: Track | undefined = undefined;

  isExternal = false;
  externalUrl?: string;
  externalAppName?: string;

  comparison: number | undefined = undefined;
  trail1CollectionName?: string;
  trail2CollectionName?: string;

  private _lockForDescription?: () => void;
  editingDescription = false;
  @ViewChild('descriptionEditor') descriptionEditor?: IonTextarea;

  constructor(
    injector: Injector,
    private readonly trackService: TrackService,
    public readonly i18n: I18nService,
    private readonly browser: BrowserService,
    private readonly auth: AuthService,
    public readonly trailService: TrailService,
    private readonly traceRecorder: TraceRecorderService,
    private readonly tagService: TagService,
    private readonly photoService: PhotoService,
    private readonly changesDetector: ChangeDetectorRef,
  ) {
    super(injector);
    changesDetector.detach();
    this.hover = new TrailHoverCursor(() => this.map, () => this.elevationGraph);
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
    this.isExternal = false;
    this.externalUrl = undefined;
    this.externalAppName = undefined;
    this.recording = null;
    this.tagsNames1 = undefined;
    this.tagsNames2 = undefined;
    this.photos = undefined;
    this.comparison = undefined;
    this.tracks$.next([]);
    this.mapTracks$.next([]);
    this.listenForTracks();
    this.listenForWayPoints();
    this.listenForTags();
    this.listenForPhotos();
    this.listenForPhotosOnMap();
    this.listenForRecordingUpdates();
    this.listenForLanguageChange();
    this.listenForCollections();
  }

  private listenForTracks(): void {
    const recording$ = this.recording$ ? combineLatest([this.recording$, this.showOriginal$]).pipe(map(([r,s]) => r ? {recording: r, track: s ? r.rawTrack : r.track} : null)) : of(null);
    this.byStateAndVisible.subscribe(
      combineLatest([this.trail$(this.trail1$), this.trail$(this.trail2$), recording$, this.toolsBaseTrack$, this.toolsModifiedTrack$, this.toolsFocusTrack$, this.toolsHideBaseTrack$, this.showBreaks$]).pipe(
        debounceTime(1)
      ),
      ([trail1, trail2, recordingWithTrack, toolsBaseTrack, toolsModifiedTrack, toolsFocusTrack, hideBaseTrack, showBreaks]) => { // NOSONAR
        if (this.trail1 !== trail1[0]) {
          if (this._lockForDescription) {
            this._lockForDescription();
            this._lockForDescription = undefined;
            this.editingDescription = false;
          }
        }
        this.trail1 = trail1[0];
        this.trail2 = trail2[0];
        this.isExternal = !!this.trail1 && this.trail1.owner.indexOf('@') < 0 && !this.trail2;
        if (this.isExternal)
          this.injector.get(FetchSourceService).getExternalUrl$(this.trail1!.owner, this.trail1!.uuid)
          .pipe(first())
          .subscribe(url => {
            if (this.trail1 !== trail1[0]) return; // already changed
            this.externalUrl = url ?? undefined;
            this.changesDetector.detectChanges();
          });
        this.externalAppName = this.isExternal ? this.injector.get(FetchSourceService).getName(this.trail1!.owner) : undefined;
        this.recording = recordingWithTrack ? recordingWithTrack.recording : null;
        const tracks: Track[] = [];
        const mapTracks: MapTrack[] = [];
        this.elevationTrack1 = undefined;
        this.elevationTrack2 = undefined;
        if (trail1[1] && trail2[1])
          this.comparison = Math.floor(estimateSimilarity(trail1[1], trail2[1]) * 100);
        else
          this.comparison = undefined;

        if (toolsBaseTrack && !recordingWithTrack && !trail2[0]) {
          tracks.push(toolsBaseTrack);
          this.elevationTrack1 = toolsBaseTrack;
          if (!hideBaseTrack || !toolsModifiedTrack) {
            const mapTrack = new MapTrack(undefined, toolsBaseTrack, 'red', 1, false, this.i18n);
            mapTrack.showArrowPath();
            if (!toolsModifiedTrack) {
              mapTrack.showDepartureAndArrivalAnchors();
              mapTrack.showWayPointsAnchors();
              mapTrack.showBreaksAnchors(showBreaks);
            }
            mapTracks.push(mapTrack);
          }
        }
        if (trail1[1] && !toolsBaseTrack) {
          tracks.push(trail1[1]);
          if (!toolsModifiedTrack || !hideBaseTrack)
            this.elevationTrack1 = trail1[1];
          if (trail1[2] && (!toolsModifiedTrack || !hideBaseTrack)) {
            mapTracks.push(trail1[2]);
            if (!toolsModifiedTrack) {
              trail1[2].showDepartureAndArrivalAnchors();
              trail1[2].showWayPointsAnchors();
              trail1[2].showBreaksAnchors(showBreaks);
            }
          }
          if (trail2[1]) {
            tracks.push(trail2[1]);
            this.elevationTrack2 = trail2[1];
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
          if (trail1[1])
            this.elevationTrack2 = recordingWithTrack.track;
          else
            this.elevationTrack1 = recordingWithTrack.track;
          const mapTrack = new MapTrack(recordingWithTrack.recording.trail, recordingWithTrack.track, 'blue', 1, true, this.i18n);
          mapTrack.showDepartureAndArrivalAnchors();
          mapTrack.showArrowPath();
          mapTracks.push(mapTrack)
        }

        if (!recordingWithTrack && !trail2[0]) {
          if (toolsModifiedTrack) {
            tracks.push(toolsModifiedTrack);
            if (this.elevationTrack1)
              this.elevationTrack2 = toolsModifiedTrack;
            else
              this.elevationTrack1 = toolsModifiedTrack;
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
            mapTracks.push(new MapTrack(undefined, toolsFocusTrack, '#E0E000C0', 1, false, this.i18n));
            this.pathSelection.clear();
            this.elevationTrack1 = toolsFocusTrack;
            this.elevationTrack2 = undefined;
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

  private listenForWayPoints(): void {
    this.byStateAndVisible.subscribe(
      combineLatest([this.toolsModifiedTrack$, this.tracks$]).pipe(
        map(([modified, tracks]) => modified ?? (tracks.length > 0 ? tracks[0] : undefined)),
        switchMap(track => { this.wayPointsTrack = track; return track ? track.computedWayPoints$ : of([]); })
      ),
      wayPoints => {
        if (this._highlightedWayPoint) this.unhighlightWayPoint(this._highlightedWayPoint, true);
        this.wayPoints = wayPoints;
        this.changesDetector.detectChanges();
      }, true
    );
  }

  private listenForTags(): void {
    if (!this.trail1$) return;
    this.byStateAndVisible.subscribe(
      combineLatest([this.trail1$, this.trail2$ ?? of(null)]).pipe(
        switchMap(([trail1, trail2]) =>
          combineLatest([
            trail1 && trail1.owner === this.auth.email ? this.tagService.getTrailTagsFullNames$(trail1.uuid) : of(undefined),
            trail2 && trail2.owner === this.auth.email ? this.tagService.getTrailTagsFullNames$(trail2.uuid) : of(undefined),
          ])
        ),
        debounceTimeExtended(0, 100)
      ),
      ([names1, names2]) => {
        const same = (n1: string[] | undefined, n2: string[] | undefined) =>
          (n1 === undefined && n2 === undefined) ||
          (n1 !== undefined && n2 !== undefined && Arrays.sameContent(n1, n2));
        if (same(this.tagsNames1, names1) && same(this.tagsNames2, names2)) return;
        this.tagsNames1 = names1;
        this.tagsNames2 = names2;
        this.changesDetector.detectChanges();
      }, true
    );
  }

  private listenForPhotos(): void {
    if (!this.trail1$) return;
    this.byStateAndVisible.subscribe(
      combineLatest([this.trail1$, this.trail2$ ?? of(null)]).pipe(
        switchMap(([trail1, trail2]) => trail1 && !trail2 ? this.photoService.getTrailPhotos(trail1) : of(undefined))
      ),
      photos => {
        if (photos === undefined)
          this.photos = undefined;
        else {
          photos.sort((p1,p2) => {
            if (p1.isCover) return -1;
            if (p2.isCover) return 1;
            return p1.index - p2.index;
          });
          this.photos = photos;
        }
        this.changesDetector.detectChanges();
      }, true
    );
  }

  private listenForPhotosOnMap(): void {
    if (!this.trail1$) return;
    let photosOnMap = new Map<string, L.Marker>();
    const photosByKey = new Map<string, Photo[]>();
    const dateToPoint = { trackUuid: undefined as string | undefined, cache: new Map<number, L.LatLngExpression | null>() };
    this.byStateAndVisible.subscribe(
      combineLatest([this.trail1$, this.trail2$ ?? of(null), this.showPhotos$]).pipe(
        switchMap(([trail1, trail2, showPhotos]) => {
          if (!trail1 || trail2 || !showPhotos) return of([]);
          return this.photoService.getTrailPhotos(trail1).pipe(
            switchMap(photos => {
              const withPos = photos.filter(p => p.latitude !== undefined && p.longitude !== undefined).map(p => ({photo:p, point: {lat: p.latitude!, lng: p.longitude!} as L.LatLngExpression}));
              const withDateOnly = photos.filter(p => (p.latitude === undefined || p.longitude === undefined) && p.dateTaken !== undefined);
              if (withDateOnly.length === 0) return of(withPos);
              return this.getPhotoPositionFromDate(trail1, withDateOnly, dateToPoint).pipe(map(result => [...result, ...withPos]));
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
                  markers$.push(this.createPhotoMarker(p.point, p.photos, photosByKey, key));
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

  private getPhotoPositionFromDate(trail1: Trail, photos: Photo[], dateToPoint: { trackUuid: string | undefined, cache: Map<number, L.LatLngExpression | null> }) {
    return this.showOriginal$.pipe(
      switchMap(showOriginal => showOriginal ? trail1.originalTrackUuid$ : trail1.currentTrackUuid$),
      switchMap(trackUuid => this.trackService.getFullTrack$(trackUuid, trail1.owner)),
      map(track => {
        if (!track) return [];
        if (track.uuid !== dateToPoint.trackUuid) {
          dateToPoint.trackUuid = track.uuid;
          dateToPoint.cache.clear();
        }
        return photos.map(photo => {
          const date = photo.dateTaken!;
          let point: L.LatLngExpression | null | undefined = dateToPoint.cache.get(date);
          if (point === undefined) {
            const closest = TrackUtils.findClosestPointForTime(track, date);
            point = closest ? {lat: closest.pos.lat, lng: closest.pos.lng} : null;
            dateToPoint.cache.set(date, point);
          }
          return {photo, point};
        })
        .filter(p => !!p.point) as {photo: Photo, point: L.LatLngExpression}[];
      })
    );
  }

  private createPhotoMarker(point: L.LatLngExpression, photos: Photo[], photosByKey: Map<string, Photo[]>, key: string) {
    return this.photoService.getFile$(photos[0].owner, photos[0].uuid).pipe(
      switchMap(blob => from(ImageUtils.convertToJpeg(blob, 75, 75, 0.7))),
      switchMap(jpeg => from(new BinaryContent(jpeg.blob).toBase64()).pipe(
        map(base64 => {
          const marker = MapPhoto.create(point, 'data:image/jpeg;base64,' + base64, jpeg.width, jpeg.height, photos.length > 1 ? '' + photos.length : undefined);
          marker.addEventListener('click', () => {
            this.photoService.openSliderPopup(photosByKey.get(key)!, 0);
          });
          return {key, marker, alreadyOnMap: false};
        }),
      )),
    );
  }

  remaining?: {
    originalTime: number | undefined,
    estimatedTime: number,
    distance: number,
    ascent: number | undefined,
    descent: number | undefined,
  };

  private listenForRecordingUpdates(): void {
    if (!this.recording$) return;
    const trackChanges$ = this.recording$.pipe(switchMap(r => r ? concat(of(r), r.track.changes$.pipe(map(() => r))) : of(undefined)));
    let previousDistance = 0;
    this.byStateAndVisible.subscribe(
      trackChanges$.pipe(debounceTimeExtended(1000, 5000, 100, (p, n) => !!n && n.track.metadata.distance - previousDistance > 100),),
      r => {
        previousDistance = r ? r.track.metadata.distance : 0;
        const pt = r?.track.arrivalPoint;
        if (pt && this.elevationGraph) {
          this.elevationGraph.updateRecording(r.track);
        }
      }, true
    );
    this.byStateAndVisible.subscribe(
      trackChanges$.pipe(debounceTimeExtended(5000, 10000, 250)),
      r => {
        let remaining: Track | undefined = undefined;
        const pt = r?.track.arrivalPoint;
        if (pt && this.tracks$.value.length > 1) {
          const track = this.tracks$.value[0];
          const closestPoint = TrackUtils.findLastClosePointInTrack(pt.pos, track, 50);
          if (closestPoint) {
            remaining = track.subTrack(closestPoint.segmentIndex, closestPoint.pointIndex, track.segments.length - 1, track.segments[track.segments.length - 1].points.length - 1);
          }
        }
        if (remaining) {
          this.remaining = {
            originalTime: remaining.metadata.duration,
            estimatedTime: remaining.computedMetadata.estimatedDurationSnapshot(),
            distance: remaining.metadata.distance,
            ascent: remaining.metadata.positiveElevation,
            descent: remaining.metadata.negativeElevation,
          };
          this.changesDetector.detectChanges();
        } else if (this.remaining) {
          this.remaining = undefined;
          this.changesDetector.detectChanges();
        }
      }
    )
  }

  private listenForLanguageChange(): void {
    this.whenVisible.subscribe(
      this.injector.get(I18nService).texts$.pipe(skip(1)),
      () => this.changesDetector.detectChanges(),
      true
    );
  }

  private listenForCollections(): void {
    this.whenVisible.subscribe(
      combineLatest([this.trail1$ ?? of(null), this.trail2$ ?? of(null), this.auth.auth$, this.i18n.texts$]).pipe(
        switchMap(([trail1, trail2, auth]) => {
          if (!trail1 || !trail2 || trail1.collectionUuid === trail2.collectionUuid || !auth || trail1.owner !== auth.email || trail2.owner !== auth.email) return of([null, null]);
          return combineLatest([
            this.injector.get(TrailCollectionService).getCollection$(trail1.collectionUuid, trail1.owner),
            this.injector.get(TrailCollectionService).getCollection$(trail2.collectionUuid, trail2.owner)
          ]);
        })
      ),
      ([col1, col2]) => {
        if (!col1 || !col2) {
          if (this.trail1CollectionName || this.trail2CollectionName) {
            this.trail1CollectionName = undefined;
            this.trail2CollectionName = undefined;
            this.changesDetector.detectChanges();
          }
          return;
        }
        const name1 = col1.type === TrailCollectionType.MY_TRAILS && col1.name.length === 0 ? this.i18n.texts.my_trails : col1.name;
        const name2 = col2.type === TrailCollectionType.MY_TRAILS && col2.name.length === 0 ? this.i18n.texts.my_trails : col2.name;
        if (this.trail1CollectionName !== name1 || this.trail2CollectionName !== name2) {
          this.trail1CollectionName = name1;
          this.trail2CollectionName = name2;
          this.changesDetector.detectChanges();
      }
      }
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
    this.changesDetector.detectChanges();
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
      else Console.error('unexpected child', child);
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
      this.photoService.openSliderPopup(this.photos, 0);
  }

  goToDeparture(): void {
    if (this.trail1) {
      const trail = this.trail1;
      import('../../services/functions/go-to-departure').then(m => m.goToDeparture(this.injector, trail));
    }
  }

  downloadMap(): void {
    if (this.trail1) {
      const trail = this.trail1;
      import('../../services/functions/map-download').then(m => m.openMapDownloadDialog(this.injector, [trail]));
    }
  }

  openTags(trail: Trail): void {
    import('../tags/tags.component').then(m => m.openTagsDialog(this.injector, [trail], trail.collectionUuid));
  }

  startTrail(): void {
    this.traceRecorder.start(this.trail1!);
  }

  togglePauseRecordingWithoutConfirmation(): void {
    if (this.recording?.paused) {
      this.traceRecorder.resume();
    } else {
      this.traceRecorder.pause();
    }
  }

  togglePauseRecordingWithConfirmation(): void {
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
        if ((p as any).presented) p.dismiss(); // NOSONAR
      }, 10000);
    });
  }

  stopRecordingWithoutConfirmation(): void {
    this.traceRecorder.stop(true).pipe(filter(trail => !!trail), take(1))
    .subscribe(trail => this.injector.get(Router).navigateByUrl('/trail/' + trail.owner + '/' + trail.uuid));
  }

  stopRecordingWithConfirmation(): void {
    this.injector.get(AlertController).create({
      header: this.i18n.texts.trace_recorder.stop,
      message: this.i18n.texts.trace_recorder.confirm_popup.stop_message,
      buttons: [
        {
          text: this.i18n.texts.buttons.confirm,
          role: 'confirm',
          handler: () => {
            this.traceRecorder.stop(true)
            .subscribe(trail => {
              if (trail)
                this.injector.get(Router).navigateByUrl('/trail/' + trail.owner + '/' + trail.uuid);
              else if (!this.trail1)
                this.injector.get(Router).navigateByUrl('/trails/collection/my_trails');
            });
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
        if ((p as any).presented) p.dismiss(); // NOSONAR
      }, 10000);
    });
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
    this.editingDescription = false;
    if (text && this.trail1) {
      text = text.trim();
      if (this.trail1.description !== text && this._lockForDescription) {
        this.trail1.description = text;
        this.trailService.update(this.trail1, () => {
          if (this._lockForDescription) {
            this._lockForDescription();
            this._lockForDescription = undefined;
          }
        });
      }
    }
    this.changesDetector.detectChanges();
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
    this.changesDetector.detectChanges();
  }

  unhighlightWayPoint(wp: ComputedWayPoint, force: boolean): void {
    if (this._highlightedWayPoint === wp && (force || !this._highlightedWayPointFromClick)) {
      this._highlightedWayPoint = undefined;
      this._highlightedWayPointFromClick = false;
      const mapTrack = this.mapTracks$.value.find(mt => mt.track === this.wayPointsTrack);
      mapTrack?.unhighlightWayPoint(wp);
      this.changesDetector.detectChanges();
    }
  }

  toogleHighlightWayPoint(wp: ComputedWayPoint): void {
    if (this._highlightedWayPoint === wp && this._highlightedWayPointFromClick) this.unhighlightWayPoint(wp, true);
    else this.highlightWayPoint(wp, true);
  }

  openLocationDialog(): void {
    if (this.trail2 || !this.trail1 || !this.editable) return;
    const trail = this.trail1;
    import('../location-popup/location-popup.component').then(m => m.openLocationDialog(this.injector, trail));
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
      hideBaseTrack$: this.toolsHideBaseTrack$,
      map: this.map!,
      trailComponent: this,
      getMe: (me: any) => { this.editToolsComponentInstance = me; },
      close: () => {
        this.editToolsComponent = undefined;
        this.editToolsInputs = undefined;
        this.editToolsComponentInstance = undefined;
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
