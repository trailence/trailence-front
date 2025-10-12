import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, Input, ViewChild } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, concat, debounceTime, filter, first, firstValueFrom, from, map, of, skip, switchMap, take, takeWhile } from 'rxjs';
import { Trail } from 'src/app/model/trail';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { MapComponent } from '../map/map.component';
import { MapTrack } from '../map/track/map-track';
import { ComputedWayPoint, Track } from 'src/app/model/track';
import { TrackService } from 'src/app/services/database/track.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { IonSegment, IonSegmentButton, IonIcon, IonButton, IonTextarea, IonCheckbox, AlertController, IonSpinner, ModalController } from "@ionic/angular/standalone";
import { TrackMetadataComponent, TrackMetadataConfig } from '../track-metadata/track-metadata.component';
import { TrailGraphComponent } from '../trail-graph/trail-graph.component';
import { MapTrackPointReference } from '../map/track/map-track-point-reference';
import { GraphPointReference } from '../trail-graph/graph-events';
import { AuthService } from 'src/app/services/auth/auth.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { Recording, TraceRecorderService } from 'src/app/services/trace-recorder/trace-recorder.service';
import { TrailHoverCursor } from './hover-cursor';
import { Router, RouterLink } from '@angular/router';
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
import { Console } from 'src/app/utils/console';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { estimateSimilarity } from 'src/app/services/track-edition/path-analysis/similarity';
import { CompositeI18nString, DateTimeI18nString, I18nPipe, I18nString, TranslatedString } from 'src/app/services/i18n/i18n-string';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { isPublicationCollection, TrailCollectionType } from 'src/app/model/dto/trail-collection';
import { TrackEditToolsComponent } from '../track-edit-tools/track-edit-tools.component';
import { TrackEditToolComponent, TrackEditToolsStack } from '../track-edit-tools/tools/track-edit-tools-stack';
import { TrailSelection } from './trail-selection';
import { RangeReference } from 'src/app/model/point-reference';
import { MenuItem } from '../menus/menu-item';
import { ToolbarComponent } from '../menus/toolbar/toolbar.component';
import { TrailSourceType } from 'src/app/model/dto/trail';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { TrailMenuService } from 'src/app/services/database/trail-menu.service';
import { TrailCollection } from 'src/app/model/trail-collection';
import { PublicationChecklist } from './publication-checklist/checklist';
import { ModerationService } from 'src/app/services/moderation/moderation.service';
import { environment } from 'src/environments/environment';
import { FeedbackService, MyFeedback } from 'src/app/services/feedback/feedback.service';
import { RateAndCommentsComponent } from './rate-and-comments/rate-and-comments.component';
import { TrailInfo } from 'src/app/services/fetch-source/fetch-source.interfaces';
import { NetworkService } from 'src/app/services/network/network.service';
import { TextComponent } from '../text/text.component';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { FormsModule } from '@angular/forms';
import { TrailTranslations } from './trail-translations';
import { ModerationTranslationsComponent } from './moderation-translations/moderation-translations.component';
import { ObjectUtils } from 'src/app/utils/object-utils';
import { TooltipDirective } from '../tooltip/tooltip.directive';
import { CameraService } from 'src/app/services/camera/camera.service';
import { WaypointsComponent } from './waypoints/waypoints.components';
import { TrailsWaypoints } from './trail-waypoints';
import { WayPoint } from 'src/app/model/way-point';
import { samePositionRound } from 'src/app/model/point';

interface TrailSource {
  isExternal: boolean;
  isExternalOnly: boolean;
  externalUrl?: string;
  externalAppName?: string;
  sourceString?: string;
  author?: string;
  info?: TrailInfo;
  followedInfo?: TrailInfo;
}

@Component({
    selector: 'app-trail',
    templateUrl: './trail.component.html',
    styleUrls: ['./trail.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        IonSpinner,
        IonCheckbox,
        IonTextarea,
        IonButton,
        IonIcon,
        IonSegmentButton,
        IonSegment,
        CommonModule,
        FormsModule,
        MapComponent,
        TrackMetadataComponent,
        TrailGraphComponent,
        PhotoComponent,
        PhotosPopupComponent,
        I18nPipe,
        TrackEditToolsComponent,
        ToolbarComponent,
        RouterLink,
        RateAndCommentsComponent,
        TextComponent,
        ModerationTranslationsComponent,
        TooltipDirective,
        WaypointsComponent,
    ]
})
export class TrailComponent extends AbstractComponent {

  @Input() trail1$?: Observable<Trail | null>;
  @Input() trail2$?: Observable<Trail | null>;
  @Input() recording$?: Observable<Recording | null>;
  @Input() tab = 'map';

  showOriginal$ = new BehaviorSubject<boolean>(false);
  showPhotos$ = new BehaviorSubject<boolean>(false);
  reverseWay$ = new BehaviorSubject<boolean>(false);

  trail1: Trail | null = null;
  trail2: Trail | null = null;
  recording: Recording | null = null;
  tracks$ = new BehaviorSubject<Track[]>([]);
  toolsOriginalTrack$ = new BehaviorSubject<Track | undefined>(undefined);
  toolsBaseTrack$ = new BehaviorSubject<Track | undefined>(undefined);
  toolsModifiedTrack$ = new BehaviorSubject<Track | undefined>(undefined);
  toolsHideBaseTrack$ = new BehaviorSubject<boolean>(false);
  mapTracks$ = new BehaviorSubject<MapTrack[]>([]);
  tagsNames1: string[] | undefined;
  tagsNames2: string[] | undefined;
  photos: Photo[] | undefined;
  photosHavingPosition: {photos: Photo[], point: L.LatLngExpression}[] | undefined;
  graphTrack1?: Track;
  graphTrack2?: Track;
  graphZoomButtonPosition = new BehaviorSubject<{x: number, y: number} | undefined>(undefined);
  myFeedback$ = new BehaviorSubject<MyFeedback | undefined>(undefined);
  trailsForPhotoPopup: Observable<Trail | null>[] = [];

  metadataConfig: TrackMetadataConfig = {
    mergeDurationAndEstimated: false,
    showBreaksDuration: true,
    showHighestAndLowestAltitude: true,
    allowSmallOnOneLine: false,
    mayHave2Values: true,
    alwaysShowElevation: true,
    showSpeed: true,
  };

  translations = new TrailTranslations();

  @ViewChild(MapComponent)
  set map(child: MapComponent | undefined) {
    this.map$.next(child);
  }
  get map() {
    return this.map$.value;
  }

  map$ = new BehaviorSubject<MapComponent | undefined>(undefined);

  @ViewChild(TrailGraphComponent)
  set graph(child: TrailGraphComponent | undefined) {
    this.graph$.next(child ?? undefined);
  }
  get graph() {
    return this.graph$.value;
  }

  graph$ = new BehaviorSubject<TrailGraphComponent | undefined>(undefined);

  displayMode = 'loading';
  bottomSheetOpen = true;
  bottomSheetTab = 'info';
  isSmall = false;

  editable = false;

  hover: TrailHoverCursor;
  selection = new TrailSelection(this.map$, this.graph$);

  trailsWaypoints: TrailsWaypoints;

  comparison: number | undefined = undefined;
  trail1CollectionName?: string;
  trail1Collection?: TrailCollection;
  trail2CollectionName?: string;
  isPublication = false;
  publicationChecklist?: PublicationChecklist;
  source?: TrailSource;
  currentPublicTrailUuid?: string;
  isShowPublicTrailsAround = false;
  publicTrailsAroundMapTracks$ = new BehaviorSubject<MapTrack[]>([]);
  canTakePhoto = false;

  private _lockForDescription?: () => void;
  editingDescription = false;
  @ViewChild('descriptionEditor') descriptionEditor?: IonTextarea;

  toolsStack?: TrackEditToolsStack;
  toolsEnabled = false;
  @ViewChild('editTools') editTools?: TrackEditToolsComponent;

  @ViewChild('toolbar') toolbar?: ToolbarComponent;
  toolbarItems: MenuItem[] = [
    new MenuItem().setIcon('download').setI18nLabel('pages.trail.actions.download_map')
      .setVisible(() => !isPublicationCollection(this.trail1Collection?.type) && this.trail1?.fromModeration !== true)
      .setAction(() => this.downloadMap()),
    new MenuItem().setIcon('car').setI18nLabel('pages.trail.actions.go_to_departure')
      .setVisible(() => !isPublicationCollection(this.trail1Collection?.type) && this.trail1?.fromModeration !== true && !this.recording)
      .setAction(() => this.goToDeparture()),
    new MenuItem().setIcon('play-circle').setI18nLabel('trace_recorder.start_this_trail')
      .setVisible(() => !!this.trail1 && !this.recording && !this.toolsEnabled && !isPublicationCollection(this.trail1Collection?.type) && this.trail1?.fromModeration !== true && !!this.auth.email)
      .setAction(() => this.startTrail()),
    new MenuItem().setIcon('check-list').setI18nLabel('publications.checklist')
      .setVisible(() => !this.trail2 && !!this.publicationChecklist)
      .setBadgeTopRight(() => ({ text: this.publicationChecklist?.nbUnchecked === 0 ? '✔' : '' + this.publicationChecklist?.nbChecked, color: 'success', fill: true }))
      .setBadgeTopLeft(() => this.publicationChecklist?.nbUnchecked ? ({ text: '' + this.publicationChecklist?.nbUnchecked, color: 'warning', fill: true }) : undefined)
      .setAction(() => this.openChecklist()),
    new MenuItem().setIcon('compare').setI18nLabel('publications.compare_current')
      .setVisible(() => !!this.currentPublicTrailUuid && !this.trail2 && !this.isShowPublicTrailsAround)
      .setAction(() => this.compareToPublicTrail()),
    new MenuItem().setIcon('compare').setI18nLabel('publications.exit_compare_current')
      .setVisible(() => !!this.currentPublicTrailUuid && !!this.trail2)
      .setAction(() => this.exitCompareToPublicTrail()),
    new MenuItem().setIcon('privacy').setI18nLabel('publications.check_public_trails_around')
      .setVisible(() => this.trail1?.fromModeration && !this.trail2 && !this.isShowPublicTrailsAround)
      .setAction(() => this.showPublicTrailsAround()),
    new MenuItem().setIcon('privacy').setI18nLabel('publications.exit_check_public_trails_around')
      .setVisible(() => this.isShowPublicTrailsAround)
      .setAction(() => this.hidePublicTrailsAround()),
    new MenuItem().setIcon('web').setI18nLabel('publications.publish')
      .setVisible(() => (this.trail1?.fromModeration || (!!this.publicationChecklist && !this.trail2)))
      .setDisabled(() =>
        (!this.trail1?.fromModeration && this.publicationChecklist?.nbUnchecked !== 0) ||
        (!!this.trail1?.fromModeration && !this.translations.valid)
      )
      .setTextColor('success')
      .setAction(() => this.publish()),
    new MenuItem().setIcon('cross').setI18nLabel('publications.moderation.reject')
      .setVisible(() => this.trail1?.fromModeration)
      .setTextColor('danger')
      .setAction(() => this.rejectPublication()),
    new MenuItem().setIcon('undo').setI18nLabel('publications.reject_to_draft')
      .setVisible(() => !!this.trail1 && !this.trail2 && this.trail1Collection?.type === TrailCollectionType.PUB_REJECT)
      .setTextColor('success')
      .setAction(() => this.rejectToDraft()),
    new MenuItem().setIcon('web').setI18nLabel('publications.modify').setTextColor('secondary')
      .setVisible(() => !!this.source?.info?.itsMine && !!this.trail1 && !this.trail2)
      .setAction(() => this.editPublication()),
    new MenuItem().setIcon('trash').setI18nLabel('buttons.delete')
      .setVisible(() => !!this.trail1 && !this.trail2 &&
        (this.trail1Collection?.type === TrailCollectionType.PUB_DRAFT || this.trail1Collection?.type === TrailCollectionType.PUB_REJECT
          //|| !!this.source?.info?.itsMine
        )
      )
      .setTextColor('danger')
      .setAction(() => this.deletePublication()),
    new MenuItem(),
    new MenuItem().setIcon('play-circle').setI18nLabel('trace_recorder.resume')
      .setVisible(() => !!this.recording && this.recording.paused)
      .setAction(() => this.togglePauseRecordingWithoutConfirmation()),
    new MenuItem().setIcon('pause-circle').setI18nLabel('trace_recorder.pause')
      .setVisible(() => !!this.recording && !this.recording.paused)
      .setAction(() => this.togglePauseRecordingWithoutConfirmation()),
    new MenuItem().setIcon('stop-circle').setI18nLabel('trace_recorder.stop')
      .setVisible(() => !!this.recording)
      .setAction(() => this.stopRecordingWithoutConfirmation()),
  ];

  mapToolbarTopRightMaxItems: number | undefined = undefined;
  @ViewChild('mapToolbarTopRight') mapToolbarTopRight?: ToolbarComponent;
  mapToolbarTopRightItems: MenuItem[] = [
    new MenuItem()
      .setSectionTitle(true)
      .setVisible(() => !!this.recording)
      .setI18nLabel('trace_recorder.notif_message')
      .setCssClass('small-section-title'),
    new MenuItem().setIcon('play-circle').setI18nLabel('trace_recorder.resume')
      .setVisible(() => !!this.recording?.paused)
      .setAction(() => this.togglePauseRecordingWithConfirmation()),
    new MenuItem().setIcon('pause-circle').setI18nLabel('trace_recorder.pause')
      .setVisible(() => !!this.recording && !this.recording.paused)
      .setAction(() => this.togglePauseRecordingWithConfirmation()),
    new MenuItem().setIcon('stop-circle').setI18nLabel('trace_recorder.stop').setTextColor('danger')
      .setVisible(() => !!this.recording && !this.recording.paused)
      .setAction(() => this.stopRecordingWithConfirmation()),
    new MenuItem(),
    new MenuItem().setIcon('camera').setI18nLabel('pages.trail.take_photo')
      .setVisible(() => !!this.recording && this.canTakePhoto)
      .setAction(() => {
        this.traceRecorder.takePhoto();
      }),
    new MenuItem().setIcon('location').setI18nLabel('track_edit_tools.tools.way_points.create_waypoint')
      .setVisible(() => !!this.recording && this.recording.track.metadata.distance > 0 && this.recording.track.wayPoints.findIndex(wp => samePositionRound(this.recording!.track.arrivalPoint!.pos, wp.point.pos)) < 0)
      .setAction(() => this.createWaypointOnRecording())
      ,
    new MenuItem(),
    new MenuItem().setIcon('star-filled').setI18nLabel('trace_recorder.follow_this_trail')
      .setVisible(() => !!this.recording && !!this.trail1 && !this.trail2 && (this.recording.followingTrailUuid !== this.trail1.uuid || this.recording.followingTrailOwner !== this.trail1.owner))
      .setAction(() => this.confirmFollowThisTrail()),
    new MenuItem().setIcon('reverse-way').setI18nLabel('pages.trail.reverse_way')
      .setVisible(() => !!this.trail1 && !this.trail2 && !this.isPublication && !this.trail1.fromModeration)
      .setTextColor(() => this.reverseWay$.value ? 'light' : 'dark')
      .setBackgroundColor(() => this.reverseWay$.value ? 'dark' : '')
      .setAction(() => this.reverseWay$.next(!this.reverseWay$.value)),
    new MenuItem(),
    new MenuItem()
      .setVisible(() => !!this.recording)
      .setIcon(() => this.trailService.getActivityIcon(this.recording?.trail?.activity))
      .setI18nLabel('metadata.activity')
      .setAction(() =>
        import('../activity-popup/activity-popup.component')
        .then(m => this.recording ? m.openActivityDialog(this.injector, [this.recording.trail], true) : undefined)
        .then(() => this.refreshMapToolbarTop())
      ),
    new MenuItem(),
    new MenuItem().setIcon('tool').setI18nLabel('track_edit_tools.title')
      .setVisible(() => this.canEdit())
      .setAction(() => this.enableEditTools()),
  ];
  private refreshMapToolbarTop() { this.mapToolbarTopRightItems = [...this.mapToolbarTopRightItems]; this.changesDetection.detectChanges(); }

  mapToolbarRightItems: MenuItem[] = [
  ];
  private refreshMapToolbarRight() { this.mapToolbarRightItems = [...this.mapToolbarRightItems]; this.changesDetection.detectChanges(); }

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
    changesDetector: ChangeDetectorRef,
    private readonly preferencesService: PreferencesService,
  ) {
    super(injector);
    changesDetector.detach();
    this.hover = new TrailHoverCursor(() => this.map, () => this.graph);
    this.selection.selection$.subscribe(sel => {
      if (sel && sel.length > 0) {
        if (sel[0] instanceof RangeReference) {
          this.hover.mouseOverPointOnMap();
        } else {
          this.hover.pointSelected(sel[0]);
        }
      }
    });
    this.trailsWaypoints = new TrailsWaypoints(this.selection, i18n);
  }

  protected override initComponent(): void {
    this.updateDisplay();
    this.whenVisible.subscribe(this.browser.resize$, () => this.updateDisplay());
    this.whenVisible.subscribe(this.trailsWaypoints.changes$.pipe(skip(1)), () => this.refreshMapToolbarRight());
    this.visible$.subscribe(() => this.updateDisplay());
    setTimeout(() => this.updateDisplay(), 0);
    const showPhotoTool = new MenuItem().setIcon('photos')
      .setVisible(() => !!this.photosHavingPosition?.length && !this.positionningOnMap$.value)
      .setTextColor(() => this.showPhotos$.value ? 'light' : 'dark')
      .setBackgroundColor(() => this.showPhotos$.value ? 'dark' : '')
      .setAction(() => {
        this.showPhotos$.next(!this.showPhotos$.value);
        this.refreshMapToolbarRight();
      });
    const showBreaksTool = new MenuItem().setIcon('hourglass')
      .setVisible(() => !this.positionningOnMap$.value && this.trailsWaypoints.canShowBreaksOnMap())
      .setTextColor(() => this.trailsWaypoints.showBreaksOnMap ? 'light' : 'dark')
      .setBackgroundColor(() => this.trailsWaypoints.showBreaksOnMap ? 'dark' : '')
      .setAction(() => {
        this.trailsWaypoints.showBreaksOnMap = !this.trailsWaypoints.showBreaksOnMap;
        this.refreshMapToolbarRight();
      });
    this.mapToolbarRightItems.push(new MenuItem(), showPhotoTool, showBreaksTool);
  }

  protected override destroyComponent(): void {
    this.trailsWaypoints.reset();
    this.selection.destroy();
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
    this.source = undefined;
    this.recording = null;
    this.tagsNames1 = undefined;
    this.tagsNames2 = undefined;
    this.photos = undefined;
    this.comparison = undefined;
    this.currentPublicTrailUuid = undefined;
    this.tracks$.next([]);
    this.mapTracks$.next([]);
    this.canTakePhoto = false;
    this.trailsForPhotoPopup = [];
    this.trailsWaypoints.reset();
    if (this.recording$) this.trailsForPhotoPopup.push(this.recording$.pipe(map(r => r?.trail ?? null)));
    if (this.trail1$) this.trailsForPhotoPopup.push(this.trail1$);
    if (this.trail2$) this.trailsForPhotoPopup.push(this.trail2$);
    this.listenForTracks();
    this.listenForTags();
    this.listenForPhotos();
    this.listenForPhotosOnMap();
    this.listenForRecordingUpdates();
    this.listenForLanguageChange();
    this.listenForCollections();
    this.listenForSource();
    this.listenMyFeedback();
    this.listenCurrentPublic();
  }

  private listenForTracks(): void {
    const recording$ = this.recording$ ? combineLatest([this.recording$, this.showOriginal$]).pipe(map(([r,s]) => r ? {recording: r, track: s ? r.rawTrack : r.track} : null)) : of(null);
    this.byStateAndVisible.subscribe(
      combineLatest([this.trail$(this.trail1$), this.trail$(this.trail2$), recording$, this.toolsBaseTrack$, this.toolsModifiedTrack$, this.selection.selectionTrack$, this.selection.zoom$, this.toolsHideBaseTrack$, this.publicTrailsAroundMapTracks$]).pipe(
        debounceTime(1)
      ),
      ([trail1, trail2, recordingWithTrack, toolsBaseTrack, toolsModifiedTrack, selectionTracks, zoomOnSelection, hideBaseTrack, publicTrailsAround]) => { // NOSONAR
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
        this.graphTrack1 = undefined;
        this.graphTrack2 = undefined;
        if (trail1[1] && trail2[1])
          this.comparison = Math.floor(estimateSimilarity(trail1[1], trail2[1]) * 100);
        else
          this.comparison = undefined;

        if (toolsBaseTrack && !recordingWithTrack && !trail2[0]) {
          tracks.push(toolsBaseTrack);
          this.graphTrack1 = toolsBaseTrack;
          if (!hideBaseTrack || !toolsModifiedTrack) {
            const mapTrack = new MapTrack(undefined, toolsBaseTrack, 'red', 1, false, this.i18n);
            mapTrack.showArrowPath();
            if (!toolsModifiedTrack) {
              mapTrack.showDepartureAndArrivalAnchors();
              mapTrack.showWayPointsAnchors();
            }
            mapTracks.push(mapTrack);
          }
        }
        if (trail1[1] && !toolsBaseTrack) {
          tracks.push(trail1[1]);
          if (!toolsModifiedTrack || !hideBaseTrack)
            this.graphTrack1 = trail1[1];
          if (trail1[2] && (!toolsModifiedTrack || !hideBaseTrack)) {
            mapTracks.push(trail1[2]);
            if (!toolsModifiedTrack) {
              trail1[2].showDepartureAndArrivalAnchors();
              trail1[2].showWayPointsAnchors();
            }
          }
          if (trail2[1]) {
            tracks.push(trail2[1]);
            this.graphTrack2 = trail2[1];
            if (trail2[2]) {
              trail2[2].color = 'blue';
              mapTracks.push(trail2[2]);
              trail2[2].showDepartureAndArrivalAnchors();
              trail2[2].showWayPointsAnchors();
            }
          }
        }

        if (recordingWithTrack && !trail2[0]) {
          tracks.push(recordingWithTrack.track);
          if (trail1[1])
            this.graphTrack2 = recordingWithTrack.track;
          else
            this.graphTrack1 = recordingWithTrack.track;
          const mapTrack = new MapTrack(recordingWithTrack.recording.trail, recordingWithTrack.track, 'blue', 1, true, this.i18n);
          mapTrack.showDepartureAndArrivalAnchors();
          mapTrack.showWayPointsAnchors();
          mapTrack.showArrowPath();
          mapTracks.push(mapTrack)
          if (this.remaining?.subTrack) {
            if (trail1[2] && trail1[2].color === 'red') trail1[2].color = '#FF000080';
            const remainingTrack = new MapTrack(undefined, this.remaining.subTrack, 'red', 1, false, this.i18n);
            remainingTrack.data = 'remaining';
            mapTracks.push(remainingTrack);
          }
        }

        if (!recordingWithTrack && !trail2[0]) {
          this.toolsOriginalTrack$.next(trail1[1]);
          if (toolsModifiedTrack) {
            tracks.push(toolsModifiedTrack);
            if (this.graphTrack1)
              this.graphTrack2 = toolsModifiedTrack;
            else
              this.graphTrack1 = toolsModifiedTrack;
            const mapTrack = new MapTrack(undefined, toolsModifiedTrack, 'blue', 1, false, this.i18n, hideBaseTrack ? 3 : 2);
            mapTrack.showDepartureAndArrivalAnchors();
            mapTrack.showWayPointsAnchors();
            mapTracks.push(mapTrack);
          }
        }

        for (const selectionTrack of selectionTracks) {
          mapTracks.push(new MapTrack(undefined, selectionTrack, '#E0E000C0', 1, false, this.i18n));
        }
        if (zoomOnSelection && selectionTracks.length > 0) {
          let bounds = undefined;
          for (let i = 0; i < selectionTracks.length; ++i) {
            const track = selectionTracks[i];
            if (track.metadata.bounds) {
              if (bounds === undefined) bounds = track.metadata.bounds;
              else bounds = bounds.extend(track.metadata.bounds);
            }
            if (i === 0) this.graphTrack1 = track;
            else if (i === 1) this.graphTrack2 = track;
          }
          if (bounds) {
            bounds = bounds.pad(0.05);
            this.map?.centerAndZoomOn(bounds);
          }
        }

        mapTracks.push(...publicTrailsAround);

        this.trailsWaypoints.update([
          {trail: trail1[0], track: toolsModifiedTrack || toolsBaseTrack || trail1[1], recording: false},
          {trail: trail2[0], track: trail2[1], recording: false},
          {trail: recordingWithTrack?.recording.trail, track:recordingWithTrack?.track, recording: true}
        ].filter(t => !!t.trail && !!t.track) as [{trail: Trail, track: Track, recording: boolean}], mapTracks);

        this.selection.tracksChanged(tracks);
        this.tracks$.next(tracks);
        this.mapTracks$.next(mapTracks);

        this.editable = !this.trail2 && !!this.trail1 &&
          (this.trail1.fromModeration || (this.trail1.owner === this.auth.email && this.trail1Collection?.type !== TrailCollectionType.PUB_SUBMIT));
        if (toolsModifiedTrack)
          this.graph?.resetChart();
        this.toolbar?.refresh();
        this.refreshMapToolbarTop();
        this.changesDetection.detectChanges();
      }, true
    );
    this.byStateAndVisible.subscribe(this.selection.selection$, () => this.changesDetection.detectChanges());
  }

  private trail$(trail$?: Observable<Trail | null>): Observable<[Trail | null, Track | undefined, MapTrack | undefined]> {
    if (!trail$) return of(([null, undefined, undefined]) as [Trail | null, Track | undefined, MapTrack | undefined]);
    return trail$.pipe(
      switchMap(trail => {
        if (!trail) return of(([null, undefined, undefined]) as [Trail | null, Track | undefined, MapTrack | undefined]);
        return combineLatest([this.showOriginal$, this.reverseWay$]).pipe(
          switchMap(([original, reverse]) => {
            const uuid$ = original ? trail.originalTrackUuid$ : trail.currentTrackUuid$;
            return uuid$.pipe(
              switchMap(uuid => trail.fromModeration ?
                this.injector.get(ModerationService).getFullTrack$(trail.uuid, trail.owner, uuid) :
                this.trackService.getFullTrack$(uuid, trail.owner)
              ),
              map(track => {
                if (!track) return ([trail, undefined, undefined]) as [Trail | null, Track | undefined, MapTrack | undefined];
                if (reverse) track = track.reverse();
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

  private listenForSource(): void {
    this.byStateAndVisible.subscribe(
      combineLatest([
        this.trail1$ ?? of(null),
        this.trail2$ ?? of(null),
        this.injector.get(FetchSourceService).isReady$,
      ]).pipe(
        switchMap(([trail1, trail2]) => {
          if (!trail1 || trail2) return of(undefined);
          const source: TrailSource = {
            isExternal: false,
            isExternalOnly: false,
            externalAppName: undefined,
            externalUrl: undefined,
            sourceString: undefined,
          }
          source.isExternal = trail1.sourceType === TrailSourceType.EXTERNAL;
          if (source.isExternal) {
            source.isExternalOnly = trail1.owner.indexOf('@') < 0;
            source.externalUrl = trail1.source;
            if (source.externalUrl?.startsWith(environment.baseUrl)) {
              if (trail1.owner === 'trailence')
                source.externalUrl = undefined;
            }
            source.externalAppName = source.externalUrl ? this.injector.get(FetchSourceService).getPluginNameByUrl(source.externalUrl) : undefined;
            if (source.externalAppName === 'Trailence' && source.externalUrl?.startsWith(environment.baseUrl))
              source.externalUrl = source.externalUrl.substring(environment.baseUrl.length);
          }
          let followedTrail: Observable<TrailInfo | null> = of(null);
          if (trail1.followedUrl) {
            const pluginName = this.injector.get(FetchSourceService).getPluginNameBySource(trail1.followedUrl);
            if (pluginName === 'Trailence')
              followedTrail = this.injector.get(FetchSourceService).plugin$('trailence').pipe(
                switchMap(p => p ? from(p.fetchTrailInfoByUrl(trail1.followedUrl!)) : of(null)),
              );
          }
          return combineLatest([
            this.getSourceString(trail1),
            trail1.owner.indexOf('@') < 0 ? this.injector.get(FetchSourceService).getTrailInfo$(trail1.owner, trail1.uuid) : of(null),
            followedTrail,
          ]).pipe(
            map(([sourceString, info, followedInfo]) => {
              if (source.externalAppName !== 'Trailence' && source?.externalUrl && !source.externalUrl.startsWith('http'))
                source.externalUrl = info?.externalUrl;
              else if (!source.externalUrl && info?.externalUrl)
                source.externalUrl = info?.externalUrl;
              source.sourceString = sourceString;
              source.author = info?.author;
              source.info = info ?? undefined;
              source.followedInfo = followedInfo ?? undefined;
              return source;
            })
          );
        }),
      ),
      source => {
        this.source = source;
        this.toolbarItems = [...this.toolbarItems];
        this.changesDetection.detectChanges();
      }
    );
  }

  private getSourceString(trail: Trail): Observable<string | undefined> {
    let src: Observable<I18nString | null | undefined>[] = [];
    switch (trail.sourceType) {
      case TrailSourceType.TRAILENCE_RECORDER:
        src.push(of(new TranslatedString('pages.trail.source.trailence_recorder', [])));
        if (trail.sourceDate && trail.sourceDate !== trail.createdAt)
          src.push(of(new TranslatedString('pages.trail.source.with_date', [new DateTimeI18nString(trail.sourceDate)])));
        if (trail.source && trail.source !== this.auth.email)
          src.push(of(new TranslatedString('pages.trail.source.with_owner', [trail.source])));
        if (trail.followedUuid && trail.followedOwner && trail.followedOwner.indexOf('@') > 0) {
          src.push(this.trailService.getTrail$(trail.followedUuid, trail.followedOwner).pipe(
            map(followedTrail => followedTrail ?
              new TranslatedString('pages.trail.source.following', ['/trail/' + trail.followedOwner + '/' + trail.followedUuid, followedTrail.name])
              : null
            ),
            map(s => {
              if (!trail.followedUrl) return s;
              const pluginName = this.injector.get(FetchSourceService).getPluginNameBySource(trail.followedUrl);
              if (!pluginName) return s;
              return new CompositeI18nString([s, new TranslatedString('pages.trail.source.initially_found_on', [trail.followedUrl, pluginName])]);
            })
          ));
        } else if (trail.followedUrl) {
          const pluginName = this.injector.get(FetchSourceService).getPluginNameBySource(trail.followedUrl);
          if (pluginName) {
            const plugin = this.injector.get(FetchSourceService).getPluginByName(pluginName)!;
            if (trail.followedOwner === plugin.owner && !!trail.followedUuid && plugin.allowed) {
              src.push(of(new TranslatedString('pages.trail.source.following_found_on', ['/trail/' + trail.followedOwner + '/' + trail.followedUuid, pluginName])));
            } else {
              src.push(of(new TranslatedString('pages.trail.source.following_found_on', [trail.followedUrl, pluginName])));
            }
          }
        }
        break;
      case TrailSourceType.TRAILENCE_PLANNER:
        src.push(of(new TranslatedString('pages.trail.source.trailence_planner', [])));
        if (trail.sourceDate && trail.sourceDate !== trail.createdAt)
          src.push(of(new TranslatedString('pages.trail.source.with_date', [new DateTimeI18nString(trail.sourceDate)])));
        if (trail.source && trail.source !== this.auth.email)
          src.push(of(new TranslatedString('pages.trail.source.with_owner', [trail.source])));
        break;
      case TrailSourceType.FILE_IMPORT:
        if (trail.source)
          src.push(of(new TranslatedString('pages.trail.source.file_import', [trail.source])));
        else
          src.push(of(new TranslatedString('pages.trail.source.file_import_unknown', [])));
        if (trail.sourceDate && trail.sourceDate !== trail.createdAt)
          src.push(of(new TranslatedString('pages.trail.source.with_date', [new DateTimeI18nString(trail.sourceDate)])));
        break;
      case TrailSourceType.EXTERNAL: {
        const pluginName = this.injector.get(FetchSourceService).getPluginNameBySource(trail.source);
        if (pluginName) {
          src.push(of(new TranslatedString('pages.trail.source.external', [pluginName])));
          if (trail.sourceDate && trail.sourceDate !== trail.createdAt)
            src.push(of(new TranslatedString('pages.trail.source.with_date', [new DateTimeI18nString(trail.sourceDate)])));
        }
        break;
      }
    }
    if (src.length === 0) return of(undefined);
    return combineLatest(src).pipe(
      switchMap(strings => {
        const notNull = strings.filter(s => !!s);
        return notNull.length === 1 ? notNull[0].translate$(this.i18n) : new CompositeI18nString(notNull).translate$(this.i18n)
      })
    );
  }

  private listenMyFeedback(): void {
    this.byStateAndVisible.subscribe(
      combineLatest([this.trail1$ ?? of(null), this.trail2$ ?? of(null), this.recording$ ?? of(null), this.auth.auth$]).pipe(
        switchMap(([trail1, trail2, recording, auth]) => {
          if (!trail2 && !recording && trail1?.followedUrl?.startsWith(environment.baseUrl + '/trail/trailence/') && auth && !auth.isAnonymous) {
            return this.injector.get(NetworkService).server$.pipe(
              switchMap(connected => {
                if (!connected) return of(null);
                return this.injector.get(FeedbackService).getMyFeedback(trail1.followedUrl!.substring(environment.baseUrl.length + 17));
              }),
              takeWhile(v => !v, true),
            );
          }
          return of(null);
        })
      ),
      myFeedback => {
        const newValue = myFeedback ?? undefined;
        if (newValue !== this.myFeedback$.value) {
          this.myFeedback$.next(newValue);
          this.changesDetection.detectChanges();
        }
      }
    );
  }

  private listenCurrentPublic(): void {
    if (!this.trail1$) return;
    this.trail1$.pipe(
      filterDefined(),
      filter(t => t.fromModeration && !!t.publishedFromUuid),
      switchMap(t => this.injector.get(ModerationService).getPublicUuid(t.publishedFromUuid!, t.owner)),
      take(1),
    ).subscribe(uuid => {
      this.currentPublicTrailUuid = uuid;
      this.toolbarItems = [...this.toolbarItems];
      this.changesDetection.detectChanges();
    })
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
        this.tagsNames1 = names1?.sort((t1, t2) => t1.localeCompare(t2, this.preferencesService.preferences.lang));;
        this.tagsNames2 = names2?.sort((t1, t2) => t1.localeCompare(t2, this.preferencesService.preferences.lang));;
        this.changesDetection.detectChanges();
      }, true
    );
  }

  private listenForPhotos(): void {
    if (!this.trail1$ && !this.recording$) return;
    this.byStateAndVisible.subscribe(
      combineLatest([this.trail1$ ?? of(null), this.trail2$ ?? of(null), this.recording$ ?? of(null)]).pipe(
        switchMap(([trail1, trail2, recording]) => combineLatest([
          trail1 ? this.photoService.getTrailPhotos$(trail1) : of([] as Photo[]),
          trail2 ? this.photoService.getTrailPhotos$(trail2) : of([] as Photo[]),
          recording ? recording.photos$ as Observable<Photo[]> : of([] as Photo[]),
        ])),
        map(([p1, p2, p3]) => [...p1, ...p2, ...p3])
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
        this.refreshMapToolbarRight();
      }, true
    );
  }

  private listenForPhotosOnMap(): void {
    if (!this.trail1$ || !this.recording$) return;
    let photosOnMap = new Map<string, L.Marker>();
    const photosByKey = new Map<string, Photo[]>();
    const dateToPoint = new Map<string, Map<number, L.LatLngExpression | null>>();
    const getTrack = (trail: Trail) =>
      this.showOriginal$.pipe(
        switchMap(showOriginal => showOriginal ? trail.originalTrackUuid$ : trail.currentTrackUuid$),
        switchMap(trackUuid => trail.fromModeration ? this.injector.get(ModerationService).getFullTrack$(trail.uuid, trail.owner, trackUuid) : this.trackService.getFullTrack$(trackUuid, trail.owner))
      );
    this.byStateAndVisible.subscribe(
      combineLatest([this.trail1$ ?? of(null), this.trail2$ ?? of(null), this.recording$ ?? of(null), this.showPhotos$]).pipe(
        switchMap(([trail1, trail2, recording, showPhotos]) =>
          combineLatest([
            trail1 ? this.photoService.getTrailPhotos$(trail1) : of([]),
            trail2 ? this.photoService.getTrailPhotos$(trail2) : of([]),
            recording ? recording.photos$ as Observable<Photo[]> : of([]),
          ]).pipe(
            switchMap(([p1, p2, p3]) => combineLatest([
              trail1 && p1.length > 0 ? this.getPhotosWithPosition(p1, () => getTrack(trail1), dateToPoint) : of([]),
              trail2 && p2.length > 0 ? this.getPhotosWithPosition(p2, () => getTrack(trail2), dateToPoint) : of([]),
              recording && p3.length > 0 ? this.getPhotosWithPosition(p3, () => of(recording.track), dateToPoint) : of([]),
            ])),
            map(([p1, p2, p3]) => [...p1, ...p2, ...p3]),
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
              this.photosHavingPosition = photosWithPoint;
              if (photosWithPoint.length === 0 || !showPhotos) return of([]);
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
          )
        ),
      ),
      result => {
        if (!this.map) return;
        for (const marker of photosOnMap.values()) this.map.removeFromMap(marker);
        photosOnMap.clear();
        for (const element of result) {
          photosOnMap.set(element.key, element.marker);
          if (!element.alreadyOnMap) this.map.addToMap(element.marker);
        }
        this.refreshMapToolbarRight();
      }, true
    );
  }

  private getPhotosWithPosition(photos: Photo[], getTrack: () => Observable<Track | null>, dateToPoint: Map<string, Map<number, L.LatLngExpression | null>>) {
    const withPos = photos.filter(p => p.latitude !== undefined && p.longitude !== undefined).map(p => ({photo:p, point: {lat: p.latitude!, lng: p.longitude!} as L.LatLngExpression}));
    const withDateOnly = photos.filter(p => (p.latitude === undefined || p.longitude === undefined) && p.dateTaken !== undefined);
    if (withDateOnly.length === 0) return of(withPos);
    return getTrack().pipe(map(track => this.getPhotoPositionFromDate(track, withDateOnly, dateToPoint)), map(result => [...result, ...withPos]));
  }

  private getPhotoPositionFromDate(track: Track | null, photos: Photo[], dateToPoint: Map<string, Map<number, L.LatLngExpression | null>>) {
    if (!track) return [];
    let cache = dateToPoint.get(track.uuid);
    if (!cache) {
      cache = new Map<number, L.LatLngExpression | null>();
      dateToPoint.set(track.uuid, cache);
    }
    return photos.map(photo => {
      const date = photo.dateTaken!;
      let point: L.LatLngExpression | null | undefined = cache.get(date);
      if (point === undefined) {
        const closest = TrackUtils.findClosestPointForTime(track, date);
        point = closest ? {lat: closest.pos.lat, lng: closest.pos.lng} : null;
        cache.set(date, point);
      }
      return {photo, point};
    })
    .filter(p => !!p.point) as {photo: Photo, point: L.LatLngExpression}[];
  }

  private createPhotoMarker(point: L.LatLngExpression, photos: Photo[], photosByKey: Map<string, Photo[]>, key: string) {
    return this.photoService.getFile$(photos[0]).pipe(
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
    segmentIndex: number | undefined,
    pointIndex: number | undefined,
    subTrack: Track | undefined,
  };

  private listenForRecordingUpdates(): void {
    if (!this.recording$) return;
    this.injector.get(CameraService).canTakePhoto().then(canTakePhoto => {
      if (canTakePhoto) {
        this.canTakePhoto = true;
        this.refreshMapToolbarTop();
      }
    });
    const trackChanges$ = this.recording$.pipe(switchMap(r => r ? concat(of(r), r.track.changes$.pipe(map(() => r))) : of(undefined)));
    let previousDistance = 0;
    this.byStateAndVisible.subscribe(
      combineLatest([trackChanges$, this.graph$, this._bottomSheetTab$])
      .pipe(debounceTimeExtended(1000, 5000, 50, (p, n) => (!!n[0] && n[0].track.metadata.distance - previousDistance > 25) || p[1] !== n[1] || (!p[1]?.visible && !!n[1]?.visible) || p[1]?.graphType !== n[1]?.graphType || p[2] !== n[2]),),
      ([r, g, tab]) => {
        previousDistance = r ? r.track.metadata.distance : 0;
        let remaining: Track | undefined = undefined;
        const pt = r?.track.arrivalPoint;
        let closestPoint: { segmentIndex: number, pointIndex: number } | undefined = undefined;
        if (pt && this.tracks$.value.length > 1) {
          const track = this.tracks$.value[0];
          closestPoint = TrackUtils.findNextClosestPointInTrack(pt.pos, track, 250, this.remaining?.segmentIndex ?? 0, this.remaining?.pointIndex ?? 0);
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
            segmentIndex: closestPoint?.segmentIndex,
            pointIndex: closestPoint?.pointIndex,
            subTrack: remaining,
          };

          let mapTrack = this.mapTracks$.value.find(mt => mt.track === this.tracks$.value[0] && mt.color === 'red');
          if (mapTrack)
            mapTrack.color = '#FF000080';

          let index = this.mapTracks$.value.findIndex(mt => mt.data === 'remaining');
          if (index >= 0) this.mapTracks$.value.splice(index, 1);
          mapTrack = new MapTrack(undefined, remaining, 'red', 1, false, this.i18n);
          mapTrack.data = 'remaining';
          this.mapTracks$.value.push(mapTrack);
          this.mapTracks$.next(this.mapTracks$.value);
        } else if (this.remaining) {
          this.remaining = undefined;
          let mapTrack = this.mapTracks$.value.find(mt => mt.track === this.tracks$.value[0] && mt.color === '#FF000080');
          if (mapTrack)
            mapTrack.color = 'red';
          let index = this.mapTracks$.value.findIndex(mt => mt.data === 'remaining');
          if (index >= 0) {
            this.mapTracks$.value.splice(index, 1);
            this.mapTracks$.next(this.mapTracks$.value);
          }
        }
        if (pt && this.graph) {
          this.graph.updateRecording(r.track, this.remaining?.segmentIndex, this.remaining?.pointIndex);
        }
        this.refreshMapToolbarTop();
        this.changesDetection.detectChanges();
      }
    )
  }

  private listenForLanguageChange(): void {
    this.whenVisible.subscribe(
      this.injector.get(I18nService).texts$.pipe(skip(1)),
      () => {
        this.toolbarItems = [...this.toolbarItems];
        this.refreshMapToolbarTop();
        this.refreshMapToolbarRight();
        this.changesDetection.detectChanges();
      },
      true
    );
  }

  private listenForCollections(): void {
    this.whenVisible.subscribe(
      combineLatest([
        this.auth.auth$,
        combineLatest([this.trail1$ ?? of(null), this.trail2$ ?? of(null)]).pipe(
          switchMap(([trail1, trail2]) => {
            if (!trail1) return of({col1: null, col2: null, trail1, trail2, track: null});
            return combineLatest([
              this.injector.get(TrailCollectionService).getCollectionWithName$(trail1.collectionUuid, trail1.owner),
              trail2 ? this.injector.get(TrailCollectionService).getCollectionWithName$(trail2.collectionUuid, trail2.owner) : of(null),
              this.trackService.getFullTrackReady$(trail1.currentTrackUuid, trail1.owner),
            ]).pipe(
              map(([col1, col2, track]) => ({col1, col2, track, trail1, trail2}))
            );
          }),
        ),
      ]),
      ([auth, result]) => {
        this.trail1Collection = result.col1?.collection ?? undefined;
        this.trail1CollectionName = result.col1?.name ?? undefined;
        this.isPublication = isPublicationCollection(this.trail1Collection?.type);
        if (result.col1?.collection !== result.col2?.collection && auth && result.col1?.collection.owner === auth.email && result.col2?.collection.owner === auth.email) {
          this.trail2CollectionName = result.col2.collection.name;
        }
        if (result.trail1 && result.track && this.trail1Collection?.type === TrailCollectionType.PUB_DRAFT) {
          if (!this.publicationChecklist || this.publicationChecklist.trailUuid !== result.trail1.uuid || this.publicationChecklist.trailOwner !== result.trail1.owner)
            this.publicationChecklist = PublicationChecklist.load(result.trail1, result.track, this.trailService);
        } else {
          this.publicationChecklist = undefined;
        }
        if (result.col1?.collection.type === TrailCollectionType.PUB_SUBMIT) this.editable = false;
        this.changesDetection.detectChanges();
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
      if (this.bottomSheetTab === 'info') this.bottomSheetTab = 'elevation';
      this.updateVisibility(true, this.bottomSheetOpen);
    } else {
      this.displayMode = h > 500 || w < 500 ? 'small' : 'small small-height bottom-sheet-tab-open-' + this.bottomSheetTab;
      this.isSmall = true;
      this.updateVisibility(this.tab === 'map', this.bottomSheetTab === 'elevation' || this.bottomSheetTab === 'speed');
    }
    this.mapToolbarTopRightMaxItems = w > 600 ? undefined : Math.floor((w - 85) / 48);
    this.changesDetection.detectChanges();
  }

  private updateVisibility(mapVisible: boolean, graphVisible: boolean): void {
    this._children$.value.forEach(child => {
      if (child instanceof MapComponent) child.setVisible(mapVisible);
      else if (child instanceof TrailGraphComponent) child.setVisible(graphVisible);
      else if (child instanceof TrackMetadataComponent) {
        // nothing
      }
      else Console.error('unexpected child', child);
    });
  }

  protected override getChildVisibility(child: AbstractComponent): boolean | undefined {
    if (child instanceof MapComponent) return !this.isSmall || this.tab === 'map';
    if (child instanceof TrailGraphComponent)
      return (this.isSmall && (this.bottomSheetTab === 'elevation' || this.bottomSheetTab === 'speed')) ||
             (!this.isSmall && this.bottomSheetOpen);
    return undefined;
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

  private readonly _bottomSheetTab$ = new BehaviorSubject<string>(this.bottomSheetTab);
  setBottomSheetTab(tab: string): void {
    if (tab === this.bottomSheetTab) return;
    this.bottomSheetTab = tab;
    this._bottomSheetTab$.next(tab);
    this.updateDisplay();
  }


  mouseOverPointOnMap(event: MapTrackPointReference[]) {
    this.hover.mouseOverPointOnMap(MapTrackPointReference.closest(event.filter(mt => !mt.track.ignoreCursorHover)));
  }

  elevationGraphPointHover(references: GraphPointReference[]) {
    this.hover.graphPointHover(references);
  }

  mouseClickOnMap(event: MapTrackPointReference[]) {
    for (const ref of event) {
      if (this.publicTrailsAroundMapTracks$.value.indexOf(ref.track) >= 0) {
        window.open(environment.baseUrl + '/trail/trailence/' + ref.track.trail!.uuid, '_blank');
      }
    }
  }

  openPhotos(): void {
    this.photoService.openPopupForTrails(this.trailsForPhotoPopup)
    .then(photo => {
      if (photo) this.positionPhotoOnMap(photo);
    });
  }

  positionningOnMap$ = new BehaviorSubject<Photo | undefined>(undefined);
  mapToolbarPositionningPhotoItems: MenuItem[] = [
    new MenuItem().setSectionTitle(true).setI18nLabel('pages.trail.select_photo_position').setTextColor('secondary').setTextSize('12px'),
    new MenuItem().setIcon('checkmark').setTextColor('success').setI18nLabel('buttons.save')
      .setDisabled(() => this.tracks$.value.length === 0 || !this.selection.getSinglePointOf(this.tracks$.value[0]))
      .setAction(() => {
        const pt = this.selection.getSinglePointOf(this.tracks$.value[0]);
        if (pt) {
          const photo = this.positionningOnMap$.value!;
          this.photoService.update(photo, p => {
            p.latitude = pt.point.pos.lat;
            p.longitude = pt.point.pos.lng;
          });
        }
        this.positionningOnMap$.next(undefined);
      }),
    new MenuItem().setIcon('cross').setI18nLabel('buttons.cancel')
      .setAction(() => this.positionningOnMap$.next(undefined)),
  ];
  positionPhotoOnMap(photo: Photo): void {
    if (this.isSmall) this.setTab('map');

    const showBreaksBefore = this.trailsWaypoints.showBreaksOnMap;
    if (showBreaksBefore) this.trailsWaypoints.showBreaksOnMap = false;
    this.trailsWaypoints.showBreaksOnMapLocked = true;
    const showPhotosBefore = this.showPhotos$.value;
    if (showPhotosBefore) this.showPhotos$.next(false);
    const showOriginalBefore = this.showOriginal$.value;
    if (showOriginalBefore) this.showOriginal$.next(false);

    this.selection.cancelSelection();
    this.positionningOnMap$.next(photo);
    this.refreshMapToolbarRight();
    this.changesDetection.detectChanges();
    const subscription = this.selection.selection$.subscribe(() => this.mapToolbarPositionningPhotoItems = [...this.mapToolbarPositionningPhotoItems]);
    this.positionningOnMap$.pipe(filter(p => !p), first()).subscribe(() => {
      subscription.unsubscribe();
      this.trailsWaypoints.showBreaksOnMapLocked = false;
      if (showBreaksBefore) this.trailsWaypoints.showBreaksOnMap = true;
      if (showPhotosBefore) this.showPhotos$.next(true);
      if (showOriginalBefore) this.showOriginal$.next(true);
      this.refreshMapToolbarRight();
      this.changesDetection.detectChanges();
      if (this.isSmall) this.setTab('photos');
      else this.openPhotos();
    });
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
    this.changesDetection.detectChanges();
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
      this.changesDetection.detectChanges(() => {
        setTimeout(() => {
          if (this.descriptionEditor) this.descriptionEditor.setFocus();
        }, 0);
      });
    });
  }

  endEditDescription(text: string | null | undefined): void {
    this.editingDescription = false;
    if (text !== null && text !== undefined && this.trail1) {
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
    this.changesDetection.detectChanges();
  }

  openLocationDialog(): void {
    if (this.trail2 || !this.trail1 || !this.editable) return;
    const trail = this.trail1;
    import('../location-popup/location-popup.component').then(m => m.openLocationDialog(this.injector, trail));
  }

  openDateDialog(): void {
    if (this.trail2 || !this.trail1 || !this.editable) return;
    this.injector.get(TrailMenuService).openTrailDatePopup(this.trail1!, this.tracks$.value[0]);
  }

  openActivityDialog(): void {
    const trail = !!this.trail1 && !this.trail2 && this.editable && !this.recording ? {trail: this.trail1, isRecording: false} : !this.trail1 && this.recording ? {trail: this.recording.trail, isRecording: true} : undefined;
    if (!trail) return;
    import('../activity-popup/activity-popup.component')
    .then(m => m.openActivityDialog(this.injector, [trail.trail], trail.isRecording))
    .then(() => this.refreshMapToolbarTop());
  }

  canEdit(): boolean {
    if (!this.editable) return false;
    if (this.toolsEnabled) return false;
    if (this.trail2) return false;
    if (this.trail1?.owner !== this.auth.email && !this.trail1?.fromModeration) return false;
    if (this.recording) return false;
    return true;
  }

  highlightWayPoint(wp: ComputedWayPoint, click: boolean): void {
    this.trailsWaypoints.highlightWayPoint(wp, click);
    this.changesDetection.detectChanges();
  }

  unhighlightWayPoint(wp: ComputedWayPoint, force: boolean): void {
    if (this.trailsWaypoints.unhighlightWayPoint(wp, force))
      this.changesDetection.detectChanges();
  }

  createWaypointOnRecording(): void {
    const point = this.recording?.track.arrivalPoint;
    if (!point) return;
    const wp = new WayPoint(point, '', '');
    import('../track-edit-tools/tools/way-points/way-point-edit/way-point-edit.component')
    .then(module => this.injector.get(ModalController).create({
      component: module.WayPointEditModal,
      componentProps: {
        wayPoint: wp,
        isNew: true,
      }
    }))
    .then(modal => {
      modal.onDidDismiss().then(result => {
        if (result.role === 'ok' && this.recording?.track) {
          this.recording.track.appendWayPoint(wp);
        }
      });
      modal.present();
    });
  }

  public enableEditTools() {
    if (this.toolsEnabled) return;
    if (this.showOriginal$.value) this.showOriginal$.next(false);
    this.toolsEnabled = true;
    this.changesDetection.detectChanges(() => {
      setTimeout(() => {
        this.mapToolbarTopRight?.refresh();
        this.toolbar?.refresh();
        this.changesDetection.detectChanges();
      }, 0);
    });
  }

  public disableEditTools() {
    if (!this.toolsEnabled) return;
    this.toolsEnabled = false;
    this.changesDetection.detectChanges(() => {
      setTimeout(() => {
        this.mapToolbarTopRight?.refresh();
        this.toolbar?.refresh();
        this.changesDetection.detectChanges();
      }, 0);
    });
  }

  setToolsStack(stack: TrackEditToolsStack | undefined): void {
    const hadTools = this.toolsStack && this.toolsStack.components.length > 0;
    const hasTools = stack && stack.components.length > 0;
    this.toolsStack = stack;
    if (hadTools != hasTools) {
      setTimeout(() => {
        this.graph?.resetChart();
        this.map?.invalidateSize();
      }, 500);
    }
    this.changesDetection.detectChanges();
  }

  toolCreated(tool: TrackEditToolComponent<any>) {
    return (instance: any) => {
      tool.instance = instance;
      tool.onCreated(instance);
    };
  }

  setZoomButtonPosition(pos: {x: number, y: number} | undefined): void {
    if ((pos && !this.graphZoomButtonPosition.value) ||
        (!pos && this.graphZoomButtonPosition.value) ||
        (pos && this.graphZoomButtonPosition.value && pos.x !== this.graphZoomButtonPosition.value.x && pos.y !== this.graphZoomButtonPosition.value.y)) {
      this.graphZoomButtonPosition.next(pos);
      this.changesDetection.detectChanges();
    }
  }

  confirmFollowThisTrail(): void {
    this.injector.get(AlertController).create({
      header: this.i18n.texts.trace_recorder.follow_this_trail,
      message: new TranslatedString('trace_recorder.follow_this_trail_confirmation', [this.trail1?.name]).translate(this.i18n),
      buttons: [
        {
          text: this.i18n.texts.buttons.confirm,
          role: 'confirm',
          handler: () => {
            this.traceRecorder.setFollowedTrail(this.trail1?.owner, this.trail1?.uuid, this.trail1?.currentTrackUuid);
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

  rateThisTrail(): void {
    if (this.source?.externalUrl?.startsWith(environment.baseUrl + '/trail/trailence/'))
      this.injector.get(Router).navigateByUrl(this.source.externalUrl.substring(environment.baseUrl.length));
    else if (this.trail1?.followedUrl?.startsWith(environment.baseUrl + '/trail/trailence/'))
      this.injector.get(Router).navigateByUrl(this.trail1.followedUrl.substring(environment.baseUrl.length));
  }

  private async openChecklist() {
    const module = await import('./publication-checklist/checklist.component');
    const modal = await this.injector.get(ModalController).create({
      component: module.CheckListComponent,
      componentProps: {
        checklist: this.publicationChecklist,
        trail$: this.trail1$!,
        track$: this.tracks$.pipe(map(tracks => tracks.length > 0 ? tracks[0] : null)),
      },
      cssClass: 'large-modal'
    });
    modal.onWillDismiss().then(() => {
      this.toolbarItems = [...this.toolbarItems];
      this.changesDetection.detectChanges();
    });
    await modal.present();
  }

  private async publish() {
    const confirm = await this.injector.get(AlertController).create({
      header: this.i18n.texts.publications.publish,
      message: this.trail1?.fromModeration ? this.i18n.texts.publications.moderation.publish_confirmation : this.i18n.texts.publications.publish_confirmation,
      inputs: this.trail1?.fromModeration ? [] : [{
        type: 'textarea',
        placeholder: this.i18n.texts.publications.publish_message_placeholder,
        attributes: {
          maxlength: 50000,
          counter: true,
        }
      }],
      buttons: [
        {
          text: this.i18n.texts.buttons.confirm,
          role: 'confirm',
          handler: (result) => {
            const message = result ? result[0].trim() : '';
            this.injector.get(AlertController).dismiss(message, 'confirm');
          }
        }, {
          text: this.i18n.texts.buttons.cancel,
          role: 'cancel',
          handler: () => {
            this.injector.get(AlertController).dismiss(false, 'cancel');
          }
        }
      ]
    });
    await confirm.present();
    const result = await confirm.onDidDismiss();
    if (result.role !== 'confirm') return;

    if (this.trail1?.fromModeration) {
      const trail = this.trail1;
      const service = this.injector.get(ModerationService);
      combineLatest([
        service.getFullTrack$(trail.uuid, trail.owner, trail.currentTrackUuid).pipe(first()),
        service.getPhotos$(trail.owner, trail.uuid).pipe(first()),
      ]).subscribe(([track, photos]) => {
        service.validateAndPublish(trail, track, photos, this.translations.detectedLanguage!, this.translations.nameTranslations!, this.translations.descriptionTranslations!, (ok) => {
          if (ok)
            this.injector.get(Router).navigateByUrl('/trails/moderation');
        });
      });
    } else {
      this.publicationChecklist?.delete();
      const collection = await firstValueFrom(this.injector.get(TrailCollectionService).getOrCreatePublicationSubmit());
      const copyModule = await import('../../services/functions/copy-trails');
      copyModule.moveTrailsTo(this.injector, [this.trail1!], collection, this.trail1!.owner, t => t.publicationMessageFromAuthor = result.data, true);
      this.injector.get(Router).navigateByUrl('/trails/collection/' + this.trail1Collection!.uuid + '/' + this.trail1Collection!.owner);
    }
  }

  private async rejectPublication() {
    const confirm = await this.injector.get(AlertController).create({
      header: this.i18n.texts.publications.moderation.reject,
      inputs: [{
        type: 'textarea',
        placeholder: this.i18n.texts.publications.reject_message_placeholder,
        attributes: {
          maxlength: 50000,
          counter: true,
        }
      }],
      buttons: [
        {
          text: this.i18n.texts.buttons.confirm,
          role: 'confirm',
          handler: (result) => {
            const message = result[0].trim();
            if (message.length > 10)
              this.injector.get(AlertController).dismiss(message, 'confirm');
            return false;
          }
        }, {
          text: this.i18n.texts.buttons.cancel,
          role: 'cancel',
          handler: () => {
            this.injector.get(AlertController).dismiss(false, 'cancel');
          }
        }
      ]
    });
    await confirm.present();
    const result = await confirm.onDidDismiss();
    if (result.role !== 'confirm') return;

    const trail = this.trail1!;
    const service = this.injector.get(ModerationService);
    service.reject(trail, result.data as string, this.photos);
    this.injector.get(Router).navigateByUrl('/trails/moderation');
  }

  private async rejectToDraft() {
    const collection = await firstValueFrom(this.injector.get(TrailCollectionService).getOrCreatePublicationDraft());
    const copyModule = await import('../../services/functions/copy-trails');
    copyModule.moveTrailsTo(this.injector, [this.trail1!], collection, this.trail1!.owner);
  }

  private async editPublication() {
    const alert = await this.injector.get(AlertController).create({
      header: this.i18n.texts.publications.edit_popup.title,
      message: this.i18n.texts.publications.edit_popup.message,
      buttons: [
        {
          text: this.i18n.texts.buttons.confirm,
          role: 'success',
        }, {
          text: this.i18n.texts.buttons.cancel,
          role: 'cancel',
        }
      ]
    });
    alert.onDidDismiss().then(result => {
      if (result.role === 'success') {
        this.injector.get(TrailCollectionService)
        .getOrCreatePublicationDraft()
        .subscribe(col => {
          import('../../services/functions/copy-trails')
          .then(m => m.copyTrailsTo(this.injector, [this.trail1!], col, col.owner, true, true, true, (newTrail) => ({
            publishedFromUuid: this.source?.info?.myUuid,
            sourceType: this.source?.info?.externalUrl ? TrailSourceType.EXTERNAL : undefined,
            source: this.source?.info?.externalUrl
          })))
        });
      }
    });
    await alert.present();
  }

  private async deletePublication() {
    const module = await import('../../services/functions/delete-trails');
    const confirm = await module.confirmDeleteTrails(this.injector, [this.trail1!], true);
    if (confirm) this.publicationChecklist?.delete();
  }

  private async compareToPublicTrail() {
    const trailence = this.injector.get(FetchSourceService).getPluginByName('Trailence');
    const trail = await trailence?.getTrail(this.currentPublicTrailUuid!);
    if (trail)
      (this.trail2$ as BehaviorSubject<Trail | null>).next(trail);
  }

  private async exitCompareToPublicTrail() {
    (this.trail2$ as BehaviorSubject<Trail | null>).next(null);
  }

  translationsChanged(): void {
    let changed = false;
    let newPubData = this.trail1!.publicationData ? {...this.trail1!.publicationData} : {};
    if (this.translations.detectedLanguage) {
      if (newPubData['lang'] !== this.translations.detectedLanguage) {
        newPubData['lang'] = this.translations.detectedLanguage;
        changed = true;
      }
      if (!ObjectUtils.sameContent(newPubData['nameTranslations'], this.translations.nameTranslations)) {
        newPubData['nameTranslations'] = this.translations.nameTranslations;
        changed = true;
      }
      if (!ObjectUtils.sameContent(newPubData['descriptionTranslations'], this.translations.descriptionTranslations)) {
        newPubData['descriptionTranslations'] = this.translations.descriptionTranslations;
        changed = true;
      }
    }
    if (changed) this.trailService.doUpdate(this.trail1!, t => t.publicationData = newPubData);
    this.toolbarItems = [...this.toolbarItems];
    this.changesDetection.detectChanges();
  }

  wayPointsTranslationsChanged(): void {
    const newTrack = this.tracks$.value[0].copy(this.tracks$.value[0].owner);
    this.injector.get(ModerationService).updateTrack(this.trail1!, newTrack).subscribe();
  }

  showPublicTrailsAround(): void {
    this.isShowPublicTrailsAround = true;
    import('./check-public-trails-around')
    .then(m => m.checkPublicTrailsAround(this.injector, this.tracks$.value[0], (tracks) => {
      if (this.isShowPublicTrailsAround) this.publicTrailsAroundMapTracks$.next(tracks);
    }));
    this.toolbarItems = [...this.toolbarItems];
    this.changesDetection.detectChanges();
  }

  hidePublicTrailsAround(): void {
    this.isShowPublicTrailsAround = false;
    this.publicTrailsAroundMapTracks$.next([]);
  }

}
