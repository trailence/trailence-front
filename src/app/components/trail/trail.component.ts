import { AfterContentChecked, ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, Input, SecurityContext, ViewChild } from '@angular/core';
import { BehaviorSubject, EMPTY, Observable, Subscription, catchError, combineLatest, concat, debounceTime, distinctUntilChanged, filter, first, firstValueFrom, from, map, of, skip, switchMap, take, takeWhile, tap, timer } from 'rxjs';
import { Trail } from 'src/app/model/trail';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { MapComponent } from '../map/map.component';
import { MapTrack } from '../map/track/map-track';
import { Track } from 'src/app/model/track';
import { TrackService } from 'src/app/services/database/track.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { AsyncPipe, NgClass, NgComponentOutlet, NgStyle, NgTemplateOutlet } from '@angular/common';
import { IonSegment, IonSegmentButton, IonIcon, IonButton, IonTextarea, IonCheckbox, AlertController, IonSpinner, ModalController, ToastController, IonInput, IonBadge } from "@ionic/angular/standalone";
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
import { BrowserService } from 'src/app/services/browser/browser.service';
import { Arrays } from 'src/app/utils/arrays';
import { MapPhoto } from '../map/markers/map-photo';
import { BinaryContent } from 'src/app/utils/binary-content';
import { TrackUtils } from 'src/app/utils/track-utils';
import * as L from 'leaflet';
import { Console } from 'src/app/utils/console';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { estimateSimilarity } from 'src/app/services/track-edition/path-analysis/similarity';
import { CompositeI18nString, DateTimeI18nString, I18nPipe, I18nString, TranslatedString } from 'src/app/services/i18n/i18n-string';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { isPublicationCollection, SHARED_OWNER_PREFIX, TrailCollectionType } from 'src/app/model/dto/trail-collection';
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
import { ModerationTranslationsComponent } from './moderation-translations/moderation-translations.component';
import { TooltipDirective } from '../tooltip/tooltip.directive';
import { CameraService } from 'src/app/services/camera/camera.service';
import { WaypointsComponent } from './waypoints/waypoints.component';
import { TrailsWaypoints } from './trail-waypoints';
import { WayPoint } from 'src/app/model/way-point';
import { samePositionRound } from 'src/app/model/point';
import { MyPublicTrailsService } from 'src/app/services/database/my-public-trails.service';
import { HttpService } from 'src/app/services/http/http.service';
import { ErrorService } from 'src/app/services/progress/error.service';
import { LiveGroupDto, LiveGroupService } from 'src/app/services/live-group/live-group.service';
import { LiveGroupComponent } from '../live-group/live-group.component';
import { AvatarComponent } from '../avatar/avatar.component';
import { ContributionsBadgesComponent } from '../contributions-badges/contribution-badges.component';
import { ApiError } from 'src/app/services/http/api-error';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';
import { WorkerService } from 'src/app/worker/web-app';
import { TrackWayPoint } from 'src/app/utils/track-waypoints/track-waypoint';
import { buildOsmTrack } from 'src/app/utils/track-computed-data/build-osm-track';
import { TrackOsmStatsComponent } from './osm-stats/track-osm-stats.component';
import { TrackSection } from 'src/app/utils/track-computed-data/track-osm-stats';
import { SimplifiedTrackSnapshot } from 'src/app/model/snapshots';
import { PhotosComponent } from '../photos/photos.component';
import { buildMapMarkedTrails, MapMarkedTrail } from '../map/marked-trail/map-marked-trail';
import { MapElement } from '../map/map-element';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { TrackPointReference } from 'src/app/utils/track-computed-data/types';

interface TrailSource {
  isExternal: boolean;
  isExternalOnly: boolean;
  externalUrl?: string;
  externalAppName?: string;
  internalUrl?: string;
  externalSafeUrl?: SafeUrl;
  sourceString?: string;
  info?: TrailInfo;
  followedInfo?: TrailInfo;
  publishedFromTrail?: Trail;
}

interface RemainingData {
  originalTime: number | undefined,
  estimatedTime: number,
  distance: number,
  ascent: number | undefined,
  descent: number | undefined,
  track: Track,
  trackPosition: TrackPointReference,
  subTrack: Track,
  polyline: L.Polyline | undefined,
  map: L.Map | undefined,
}

const ALL_TABS = ['details', 'map', 'photos', 'waypoints', 'reviews', 'external'];
const LARGE_TABS = ['map', 'photos', 'reviews', 'external'];
type TAB_TYPE = 'details' | 'map' | 'photos' | 'waypoints' | 'reviews' | 'external';

class TrailWithInfo {
  public source?: TrailSource;
  public tagsNames: string[] | undefined;
  public collection?: TrailCollection;
  public collectionName?: string;
  public feedbackCount?: number;

  constructor(
    public readonly trail: Trail,
  ) {}

  getName(lang: string): string {
    const original = this.source?.info?.lang;
    if (original && original !== lang) {
      const name = this.source?.info?.nameTranslations?.[lang];
      if (name) return name;
    }
    return this.trail.name;
  }

  getDescription(lang: string): string {
    const original = this.source?.info?.lang;
    if (original && original !== lang) {
      const d = this.source?.info?.descriptionTranslations?.[lang];
      if (d) return d;
    }
    return this.trail.description;
  }
}

interface TrailTracks {
  trail: Trail | null;
  track: Track | undefined;
  mapTrack: MapTrack | undefined;
  osmTrack: Track | undefined;
  osmMapTrack: MapTrack | undefined;
  osmMarkedTrails: MapMarkedTrail[] | undefined;
}

@Component({
    selector: 'app-trail',
    templateUrl: './trail.component.html',
    styleUrls: ['./trail.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        IonSpinner, IonCheckbox, IonTextarea, IonButton, IonIcon, IonSegmentButton, IonSegment, IonInput, IonBadge,
        FormsModule,
        MapComponent,
        TrackMetadataComponent,
        TrailGraphComponent,
        PhotoComponent,
        PhotosComponent,
        I18nPipe,
        TrackEditToolsComponent,
        ToolbarComponent,
        RouterLink,
        RateAndCommentsComponent,
        TextComponent,
        ModerationTranslationsComponent,
        TooltipDirective,
        WaypointsComponent,
        NgStyle, NgClass,
        NgTemplateOutlet,
        NgComponentOutlet,
        AsyncPipe,
        LiveGroupComponent,
        AvatarComponent,
        ContributionsBadgesComponent,
        TrackOsmStatsComponent,
    ]
})
export class TrailComponent extends AbstractComponent implements AfterContentChecked {

  @Input() trail1$?: Observable<Trail | null>;
  @Input() trail2$?: Observable<Trail | null>;
  @Input() recording$?: Observable<Recording | null>;
  @Input() tab: TAB_TYPE = 'map';

  showOriginal$ = new BehaviorSubject<boolean>(false);
  showOsmTrack$ = new BehaviorSubject<boolean>(false);
  showPhotos$ = new BehaviorSubject<boolean>(false);
  reverseWay$ = new BehaviorSubject<boolean>(false);

  id = IdGenerator.generateId();
  trail1WithInfo$ = new BehaviorSubject<TrailWithInfo | null>(null);
  trail2WithInfo$ = new BehaviorSubject<TrailWithInfo | null>(null);
  recording: Recording | null = null;
  tracks$ = new BehaviorSubject<Track[]>([]);
  toolsOriginalTrack$ = new BehaviorSubject<Track | undefined>(undefined);
  toolsBaseTrack$ = new BehaviorSubject<Track | undefined>(undefined);
  toolsModifiedTrack$ = new BehaviorSubject<Track | undefined>(undefined);
  toolsHideBaseTrack$ = new BehaviorSubject<boolean>(false);
  mapElements$ = new BehaviorSubject<MapElement[]>([]);
  photos: Photo[] | undefined;
  photosHavingPosition: {photos: Photo[], point: L.LatLngExpression}[] | undefined;
  graphTrack1?: Track;
  graphTrack2?: Track;
  graphZoomButtonPosition = new BehaviorSubject<{x: number, y: number} | undefined>(undefined);
  myFeedback$ = new BehaviorSubject<MyFeedback | undefined>(undefined);
  trailsForPhotoPopup: Observable<Trail | null>[] = [];
  currentLang: string;
  liveGroups$ = new BehaviorSubject<LiveGroupDto[]>([]);
  hasOsmTrack = false;
  hasMapMarkedTrails = false;
  showMapMarkedTrails$ = new BehaviorSubject<boolean>(false);
  showTrackWithElevationColors = false;
  canShowTrackWithElevationColors = false;

  get trail1WithInfo(): TrailWithInfo | null { return this.trail1WithInfo$.value; }
  get trail2WithInfo(): TrailWithInfo | null { return this.trail2WithInfo$.value; }
  get trail1(): Trail | null { return this.trail1WithInfo?.trail || null };
  get trail2(): Trail | null { return this.trail2WithInfo?.trail || null };

  metadataConfig: TrackMetadataConfig = {
    mergeDurationAndEstimated: false,
    showBreaksDuration: true,
    showHighestAndLowestAltitude: true,
    allowSmallOnOneLine: false,
    mayHave2Values: true,
    alwaysShowElevation: true,
    showSpeed: true,
  };

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
  bottomSheetCustomHeight?: string;
  maxBottomSheetHeight?: number;
  isSmall = false;

  editable = false;
  mine = false;

  hover: TrailHoverCursor;
  selection = new TrailSelection(this.map$, this.graph$);

  trailsWaypoints: TrailsWaypoints;

  comparison: number | undefined = undefined;
  isPublication = false;
  publicationChecklist?: PublicationChecklist;
  currentPublicTrailUuid?: string;
  isShowPublicTrailsAround = false;
  publicTrailsAroundMapTracks$ = new BehaviorSubject<MapTrack[]>([]);
  canTakePhoto = false;
  publishedTrail?: Trail;
  showTextHtml = false;

  private _lock?: () => void;
  editingDescription = false;
  editingSourceUrl = false;
  @ViewChild('descriptionEditor') descriptionEditor?: IonTextarea;
  @ViewChild('sourceUrlEditor') sourceUrlEditor?: IonInput;

  toolsStack?: TrackEditToolsStack;
  toolsEnabled = false;
  @ViewChild('editTools') editTools?: TrackEditToolsComponent;

  @ViewChild('toolbar') toolbar?: ToolbarComponent;
  toolbarItems: MenuItem[] = [
    new MenuItem().setIcon('download').setI18nLabel('pages.trail.actions.download_map')
      .setVisible(() => !isPublicationCollection(this.trail1WithInfo?.collection?.type) && this.trail1?.fromModeration !== true)
      .setAction(() => this.downloadMap()),
    new MenuItem().setIcon('car').setI18nLabel('pages.trail.actions.go_to_departure')
      .setVisible(() => !isPublicationCollection(this.trail1WithInfo?.collection?.type) && this.trail1?.fromModeration !== true && !this.recording)
      .setAction(() => this.goToDeparture()),
    new MenuItem().setIcon('play-circle').setI18nLabel('trace_recorder.start_this_trail')
      .setVisible(() => !!this.trail1 && !this.recording && !this.toolsEnabled && !isPublicationCollection(this.trail1WithInfo?.collection?.type) && this.trail1?.fromModeration !== true && !!this.auth.email)
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
    new MenuItem().setIcon('text').setI18nLabel('publications.show_html_text')
      .setVisible(() => this.trail1?.fromModeration && !this.showTextHtml)
      .setAction(() => { this.showTextHtml = true; this.toolbarItems = [...this.toolbarItems]; this.changesDetection.detectChanges(); }),
    new MenuItem().setIcon('text').setI18nLabel('publications.exit_show_html_text')
      .setVisible(() => this.trail1?.fromModeration && this.showTextHtml)
      .setAction(() => { this.showTextHtml = false; this.toolbarItems = [...this.toolbarItems]; this.changesDetection.detectChanges(); }),
    new MenuItem().setIcon('web').setI18nLabel('publications.publish')
      .setVisible(() => (this.trail1?.fromModeration || (!!this.publicationChecklist && !this.trail2)))
      .setDisabled(() =>
        (!this.trail1?.fromModeration && this.publicationChecklist?.nbUnchecked !== 0) ||
        (!!this.trail1?.fromModeration && !this._translationsReady)
      )
      .setTextColor('success')
      .setAction(() => this.publish()),
    new MenuItem().setIcon('cross').setI18nLabel('publications.moderation.reject')
      .setVisible(() => this.trail1?.fromModeration)
      .setTextColor('danger')
      .setAction(() => this.rejectPublication()),
    new MenuItem().setIcon('undo').setI18nLabel('publications.reject_to_draft')
      .setVisible(() => !!this.trail1 && !this.trail2 && this.trail1WithInfo?.collection?.type === TrailCollectionType.PUB_REJECT)
      .setTextColor('success')
      .setAction(() => this.rejectToDraft()),
    new MenuItem().setIcon('web').setI18nLabel('publications.modify').setTextColor('secondary')
      .setVisible(() => !!this.trail1WithInfo?.source?.info?.itsMine && !this.trail2)
      .setAction(() => this.editPublication()),
    new MenuItem().setIcon('web').setI18nLabel('publications.remove').setTextColor('danger')
      .setVisible(() => !!this.trail1WithInfo?.source?.info?.itsMine && !this.trail2)
      .setAction(() => this.deletePublication()),
    new MenuItem().setIcon('trash').setI18nLabel('buttons.delete')
      .setVisible(() => !!this.trail1 && !this.trail2 &&
        (this.trail1WithInfo?.collection?.type === TrailCollectionType.PUB_DRAFT || this.trail1WithInfo?.collection?.type === TrailCollectionType.PUB_REJECT
          //|| !!this.source?.info?.itsMine
        )
      )
      .setTextColor('danger')
      .setAction(() => this.cancelPublication()),
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
    new MenuItem().setIcon('play-circle').setI18nLabel('trace_recorder.resume')
      .setVisible(() => !!this.recording?.paused)
      .setAction(() => this.togglePauseRecordingWithConfirmation()),
    new MenuItem().setIcon('pause-circle').setI18nLabel('trace_recorder.pause')
      .setVisible(() => !!this.recording && !this.recording.paused)
      .setAction(() => this.togglePauseRecordingWithConfirmation()),
    new MenuItem().setIcon('stop-circle').setI18nLabel('trace_recorder.stop').setTextColor('danger')
      .setVisible(() => !!this.recording && !this.recording.paused)
      .setAction(() => this.stopRecordingWithConfirmation()),
    new MenuItem().setIcon('play-circle').setI18nLabel('buttons.start')
      .setVisible(() => this.isSmall && !!this.trail1 && !this.recording && !this.toolsEnabled && !isPublicationCollection(this.trail1WithInfo?.collection?.type) && this.trail1?.fromModeration !== true && !!this.auth.email)
      .setAction(() => this.startTrail()),
    new MenuItem(),
    new MenuItem().setIcon('camera').setI18nLabel('pages.trail.take_photo')
      .setVisible(() => !!this.recording && this.canTakePhoto)
      .setAction(() => {
        this.traceRecorder.takePhoto();
      }),
    new MenuItem().setIcon('location').setI18nLabel('track_edit_tools.tools.way_points.create_waypoint')
      .setVisible(() => !!this.recording && this.recording.track.metadata.distance > 0 && !this.recording.track.wayPoints.some(wp => samePositionRound(this.recording!.track.arrivalPoint!.pos, wp.point.pos)))
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
    this.trailsWaypoints = new TrailsWaypoints(this.selection, i18n, injector.get(OfflineMapService));
    this.currentLang = this.preferencesService.preferences.lang;
  }

  protected override initComponent(): void {
    this.updateDisplay();
    this.whenVisible.subscribe(this.browser.resize$, () => this.updateDisplay());
    this.whenVisible.subscribe(this.trailsWaypoints.changes$.pipe(skip(1)), () => this.changesDetection.detectChanges());
    this.visible$.subscribe(() => this.updateDisplay());
    setTimeout(() => this.updateDisplay(), 0);
    const showPhotoTool = new MenuItem()
      .setIcon('photos')
      .setI18nLabel('pages.trail.map_elements.photos')
      .setDisabled(() => !this.photosHavingPosition?.length || !!this.positionningOnMap$.value)
      .setSelected(() => this.showPhotos$.value && !!this.photosHavingPosition?.length && !this.positionningOnMap$.value)
      .setAction((event) => {
        event.stopPropagation();
        event.preventDefault();
        this.showPhotos$.next(!this.showPhotos$.value);
        this.changesDetection.detectChanges();
      });
    const showBreaksTool = new MenuItem()
      .setIcon('hourglass')
      .setI18nLabel('pages.trail.map_elements.breaks')
      .setDisabled(() => !!this.positionningOnMap$.value || !this.trailsWaypoints.canShowBreaksOnMap())
      .setSelected(() => this.trailsWaypoints.isShowingAllBreaks() && !this.positionningOnMap$.value && this.trailsWaypoints.canShowBreaksOnMap())
      .setAction((event) => {
        event.stopPropagation();
        event.preventDefault();
        this.trailsWaypoints.toggleShowAllBreaks();
        this.changesDetection.detectChanges();
      });
    const showWaypointsTool = new MenuItem()
      .setIcon('map-anchor')
      .setI18nLabel('pages.trail.map_elements.waypoints')
      .setDisabled(() => !this.trailsWaypoints.canShowWaypointsOnMap())
      .setSelected(() => this.trailsWaypoints.showWaypointsOnMap && this.trailsWaypoints.canShowWaypointsOnMap())
      .setAction((event) => {
        event.stopPropagation();
        event.preventDefault();
        this.trailsWaypoints.toggleShowWaypointsOnMap();
        this.changesDetection.detectChanges();
      });
    const showGuidepostsTool = new MenuItem()
      .setIcon('poi-guidepost')
      .setI18nLabel('pages.trail.map_elements.guideposts')
      .setDisabled(() => !this.trailsWaypoints.canShowGuidepostsOnMap())
      .setSelected(() => this.trailsWaypoints.canShowGuidepostsOnMap() && this.trailsWaypoints.isShowingAllGuideposts())
      .setAction((event) => {
        event.stopPropagation();
        event.preventDefault();
        this.trailsWaypoints.toggleShowAllGuideposts();
        this.changesDetection.detectChanges();
      });
    const showMarkedTrailsTool = new MenuItem()
      .setIcon('trail-marking')
      .setI18nLabel('pages.trail.map_elements.marked_trails')
      .setDisabled(() => !!this.trail2 || !this.hasMapMarkedTrails)
      .setSelected(() => !this.trail2 && this.hasMapMarkedTrails && this.showMapMarkedTrails$.value)
      .setAction((event) => {
        event.stopPropagation();
        event.preventDefault();
        this.showMapMarkedTrails$.next(!this.showMapMarkedTrails$.value);
        this.changesDetection.detectChanges();
      });
    const showTrackWithElevationColors = new MenuItem()
      .setIcon('elevation')
      .setI18nLabel('pages.trail.map_elements.elevation_colors')
      .setVisible(() => this.canShowTrackWithElevationColors)
      .setSelected(() => this.showTrackWithElevationColors)
      .setAction((event) => {
        event.stopPropagation();
        event.preventDefault();
        this.showTrackWithElevationColors = !this.showTrackWithElevationColors;
        const mapTrack = this.mapElements$.value.find(e => e instanceof MapTrack && e.track === this.tracks$.value[0]) as MapTrack | undefined;
        mapTrack?.showPathWithElevationColors(this.showTrackWithElevationColors);
        this.changesDetection.detectChanges();
      })
      ;
    const showElementsTool = new MenuItem()
      .setIcon('privacy')
      .setChildren([showWaypointsTool, showBreaksTool, showGuidepostsTool, showPhotoTool, showMarkedTrailsTool, showTrackWithElevationColors]);
    this.mapToolbarRightItems.push(new MenuItem(), showElementsTool);
    if (globalThis.location.hash === '#bottom-tab=live-group') {
      this.liveGroups$.pipe(first(groups => !!groups?.length)).subscribe(groups => {
        this.bottomSheetTab = 'live-group-' + groups[0].slug;
        globalThis.location.hash = '';
        this.changesDetection.detectChanges();
      })
    }
    this.listenForTags();
    this.listenForLanguageChange();
    this.listenForCollections();
    this.listenForSource();
    this.listenForCommentsCount();
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

  private goToRate = 0;
  protected override onComponentStateChanged(previousState: any, newState: any): void {
    if (globalThis.location?.hash?.startsWith('#rate')) this.goToRate = Date.now();
    else this.goToRate = 0;
    if (this._lock) {
      this._lock();
      this._lock = undefined;
    }
    this.editingDescription = false;
    this.editingSourceUrl = false;
    this.trail1WithInfo$.next(null);
    this.trail2WithInfo$.next(null);
    this.recording = null;
    this.mine = false;
    this.photos = undefined;
    this.comparison = undefined;
    this.currentPublicTrailUuid = undefined;
    this.tracks$.next([]);
    this.mapElements$.next([]);
    this.canTakePhoto = false;
    this.trailsForPhotoPopup = [];
    this.trailsWaypoints.reset();
    this.publishedTrail = undefined;
    this.proposeToPublish = undefined;
    if (this.recording$) this.trailsForPhotoPopup.push(this.recording$.pipe(map(r => r?.trail ?? null)));
    if (this.trail1$) this.trailsForPhotoPopup.push(this.trail1$);
    if (this.trail2$) this.trailsForPhotoPopup.push(this.trail2$);
    this.hasOsmTrack = false;
    this.hasMapMarkedTrails = false;
    this.showMapMarkedTrails$.next(false);
    this.canShowTrackWithElevationColors = false;
    this.showTrackWithElevationColors = false;
    this.listenForTracks();
    this.listenForPhotos();
    this.listenForPhotosOnMap();
    this.listenForRecordingUpdates();
    this.listenMyFeedback();
    this.listenForPublished();
    this.listenCurrentPublic();
    this.listenForLiveGroups();
  }

  private _jdTrail?: Trail = undefined;
  private _jdPhotos = false;
  private _jdMarker?: HTMLElement;
  ngAfterContentChecked(): void {
    let jd: any = undefined;
    if (this.trail1WithInfo && !this.trail2 && !this.recording && this.trail1WithInfo.trail.owner === 'trailence' && this.tracks$.value.length > 0) {
      if (this._jdTrail !== this.trail1WithInfo.trail || this._jdPhotos !== (this.photos && this.photos.length > 0)) {
        jd = {
          "@context": "https://schema.org",
          "@type": "SportsActivityLocation",
          "name": this.trail1WithInfo.getName(this.preferencesService.preferences.lang),
          "description": this.trail1WithInfo.getDescription(this.preferencesService.preferences.lang),
          "geo": {
            "@type":"GeoCoordinates",
            "latitude": '' + this.tracks$.value[0].departurePoint?.pos.lat,
            "longitude": '' +this.tracks$.value[0].departurePoint?.pos.lng
          },
        };
        this._jdTrail = this.trail1WithInfo.trail;
        if (this.trail1WithInfo.source?.info?.rating !== undefined) {
          jd.aggregateRating = {
            "@type": "AggregateRating",
            "ratingValue": Math.floor(this.trail1WithInfo.source.info.rating * 10) / 10,
            "ratingCount": (this.trail1WithInfo.source.info.nbRate0 ?? 0) + (this.trail1WithInfo.source.info.nbRate1 ?? 0) + (this.trail1WithInfo.source.info.nbRate2 ?? 0) + (this.trail1WithInfo.source.info.nbRate3 ?? 0) + (this.trail1WithInfo.source.info.nbRate4 ?? 0) + (this.trail1WithInfo.source.info.nbRate5 ?? 0),
            "worstRating":0,
            "bestRating":5
          };
        }
        if (this.photos && this.photos.length > 0) {
          jd.image = environment.baseUrl + this.photos[0].uuid;
          this._jdPhotos = true;
        }
      }
    } else if (this._jdTrail !== undefined) {
      this._jdTrail = undefined;
      this._jdPhotos = false;
      jd = null;
    }
    if (jd !== undefined) {
      this._jdMarker ??= globalThis.document.getElementById('trail-jd-json-' + this.id) ?? undefined;
      if (this._jdMarker) {
        if (jd) {
          this._jdMarker.innerHTML = '<script type="application/ld+json">' + JSON.stringify(jd) + '</script>';
        } else {
          this._jdMarker.innerHTML = '';
        }
      }
    }
    if (this.goToRate > 0 && this.goToRate > Date.now() - 1000) {
      this.setTab('reviews');
      this.goToRate = 0;
    }
  }

  private proposeToPublishSubscription?: Subscription;
  proposeToPublish?: string;

  private listenForTracks(): void {
    const recording$ = this.recording$ ? combineLatest([this.recording$, this.showOriginal$]).pipe(map(([r,s]) => r ? {recording: r, track: s ? r.rawTrack : r.track} : null)) : of(null);
    this.byStateAndVisible.subscribe(
      combineLatest([
        this.trail$(this.trail1$, true),
        this.trail$(this.trail2$, false),
        recording$,
        this.toolsBaseTrack$,
        this.toolsModifiedTrack$,
        this.selection.selectionTrack$,
        this.selection.zoom$,
        this.toolsHideBaseTrack$,
        this.publicTrailsAroundMapTracks$,
        this.showMapMarkedTrails$,
      ]).pipe(
        debounceTime(1)
      ),
      ([trail1, trail2, recordingWithTrack, toolsBaseTrack, toolsModifiedTrack, selectionTracks, zoomOnSelection, hideBaseTrack, publicTrailsAround, showMapMarkedTrails]) => { // NOSONAR
        this.canShowTrackWithElevationColors = !!trail1.track && !trail2.trail;
        if (this.trail1 !== trail1.trail) {
          if (this._lock) {
            this._lock();
            this._lock = undefined;
            this.editingDescription = false;
            this.editingSourceUrl = false;
          }
          if (trail1.trail && trail1.track && !trail2.trail && !recordingWithTrack) {
            this.proposeToPublishSubscription?.unsubscribe();
            this.proposeToPublish = undefined;
            const trail = trail1;
            this.proposeToPublishSubscription = timer(3000).pipe(switchMap(() => this.trail1 === trail.trail ? this.trailService.proposeToPublish(trail.trail!, trail.track!) : EMPTY)).subscribe(result => {
              this.proposeToPublish = result;
              this.changesDetection.detectChanges();
            });
          }
          this.trail1WithInfo$.next(trail1.trail ? new TrailWithInfo(trail1.trail) : null);
        }
        if (this.trail2 !== trail2.trail) {
          this.trail2WithInfo$.next(trail2.trail ? new TrailWithInfo(trail2.trail) : null);
        }
        this.recording = recordingWithTrack ? recordingWithTrack.recording : null;
        const tracks: Track[] = [];
        const mapElements: MapElement[] = [];
        this.graphTrack1 = undefined;
        this.graphTrack2 = undefined;
        if (trail1.track && trail2.track)
          this.comparison = Math.floor(estimateSimilarity(trail1.track, trail2.track) * 100);
        else
          this.comparison = undefined;

        let toolsBaseMapTrack: MapTrack | undefined = undefined;
        if (toolsBaseTrack && !recordingWithTrack && !trail2.trail) {
          this.canShowTrackWithElevationColors = false;
          tracks.push(toolsBaseTrack);
          this.graphTrack1 = toolsBaseTrack;
          if (!hideBaseTrack || !toolsModifiedTrack) {
            toolsBaseMapTrack = new MapTrack(undefined, toolsBaseTrack, 'red', 1, false, this.i18n);
            toolsBaseMapTrack.showArrowPath();
            if (!toolsModifiedTrack) {
              toolsBaseMapTrack.onWayPointClick = wp => this.highlightWayPoint(wp, true);
              toolsBaseMapTrack.showDepartureAndArrivalAnchors();
              toolsBaseMapTrack.showWayPointsAnchors(this.trailsWaypoints.showWaypointsOnMap);
            }
            mapElements.push(toolsBaseMapTrack);
          }
        }
        if (trail1.track && !toolsBaseTrack) {
          const { track, mapTrack } = trail1.osmTrack && !this.editTools && !toolsModifiedTrack && !hideBaseTrack && !trail2.track ? {track: trail1.osmTrack, mapTrack: trail1.osmMapTrack!} : {track: trail1.track, mapTrack: trail1.mapTrack!};
          tracks.push(track);
          if (!toolsModifiedTrack || !hideBaseTrack)
            this.graphTrack1 = track;
          if (trail1.mapTrack && (!toolsModifiedTrack || !hideBaseTrack)) {
            mapElements.push(mapTrack);
            if (!toolsModifiedTrack) {
              mapTrack.onWayPointClick = wp => this.highlightWayPoint(wp, true);
              mapTrack.showDepartureAndArrivalAnchors();
              mapTrack.showWayPointsAnchors(this.trailsWaypoints.showWaypointsOnMap);
            }
          }
          if (trail2.track) {
            this.canShowTrackWithElevationColors = false;
            tracks.push(trail2.track);
            this.graphTrack2 = trail2.track;
            if (trail2.mapTrack) {
              trail2.mapTrack.color = 'blue';
              mapElements.push(trail2.mapTrack);
              trail2.mapTrack.onWayPointClick = wp => this.highlightWayPoint(wp, true);
              trail2.mapTrack.showDepartureAndArrivalAnchors();
              trail2.mapTrack.showWayPointsAnchors(this.trailsWaypoints.showWaypointsOnMap);
            }
          }
        }

        let recordingMapTrack: MapTrack | undefined = undefined;
        if (recordingWithTrack && !trail2.trail) {
          tracks.push(recordingWithTrack.track);
          if (trail1.track)
            this.graphTrack2 = recordingWithTrack.track;
          else
            this.graphTrack1 = recordingWithTrack.track;
          recordingMapTrack = new MapTrack(recordingWithTrack.recording.trail, recordingWithTrack.track, 'blue', 1, true, this.i18n);
          recordingMapTrack.showDepartureAndArrivalAnchors();
          recordingMapTrack.showWayPointsAnchors(this.trailsWaypoints.showWaypointsOnMap);
          recordingMapTrack.showArrowPath();
          recordingMapTrack.onWayPointClick = wp => this.highlightWayPoint(wp, true);
          mapElements.push(recordingMapTrack);
        }

        let toolsModifiedMapTrack: MapTrack | undefined = undefined;
        if (!recordingWithTrack && !trail2.trail) {
          this.toolsOriginalTrack$.next(trail1.track);
          if (toolsModifiedTrack) {
            this.canShowTrackWithElevationColors = false;
            tracks.push(toolsModifiedTrack);
            if (this.graphTrack1)
              this.graphTrack2 = toolsModifiedTrack;
            else
              this.graphTrack1 = toolsModifiedTrack;
            toolsModifiedMapTrack = new MapTrack(undefined, toolsModifiedTrack, 'blue', 1, false, this.i18n, hideBaseTrack ? 3 : 2);
            toolsModifiedMapTrack.showDepartureAndArrivalAnchors();
            toolsModifiedMapTrack.showWayPointsAnchors(this.trailsWaypoints.showWaypointsOnMap);
            toolsModifiedMapTrack.onWayPointClick = wp => this.highlightWayPoint(wp, true);
            mapElements.push(toolsModifiedMapTrack);
          }
        }

        for (const selectionTrack of selectionTracks) {
          mapElements.push(new MapTrack(undefined, selectionTrack, '#E0E000C0', 1, false, this.i18n));
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

        const baseTrack = mapElements.find(e => e instanceof MapTrack && e.track === tracks[0]) as MapTrack | undefined;
        if (!baseTrack) {
          this.canShowTrackWithElevationColors = false;
        } else {
          this.canShowTrackWithElevationColors &&= !!tracks[0].segments.find(s => s.points.find(p => p.ele !== undefined));
          baseTrack.showPathWithElevationColors(this.canShowTrackWithElevationColors && this.showTrackWithElevationColors);
        }
        if (!this.canShowTrackWithElevationColors) this.showTrackWithElevationColors = false;

        mapElements.push(...publicTrailsAround, ...this.highlightedMapTrackSections);

        if (trail1.osmMarkedTrails && !trail2.trail && showMapMarkedTrails) mapElements.push(...trail1.osmMarkedTrails);

        this.trailsWaypoints.update([
          {trail: trail1.trail, track: toolsModifiedTrack || toolsBaseTrack || trail1.track, recording: false, mapTrack: toolsModifiedMapTrack || toolsBaseMapTrack || trail1.mapTrack},
          {trail: trail2.trail, track: trail2.track, recording: false, mapTrack: trail2.mapTrack},
          {trail: recordingWithTrack?.recording.trail, track:recordingWithTrack?.track, recording: true, mapTrack: recordingMapTrack}
        ].filter(t => !!t.trail && !!t.track && !!t.mapTrack) as [{trail: Trail, track: Track, recording: boolean, mapTrack: MapTrack}]);

        this.selection.tracksChanged(tracks);
        this.tracks$.next(tracks);
        this.mapElements$.next(mapElements);

        this.mine = !!this.trail1 && !this.trail2 && this.trail1.owner === this.auth.email;
        if (toolsModifiedTrack)
          this.graph?.resetChart();
        this.toolbar?.refresh();
        this.refreshMapToolbarTop();
        this.changesDetection.detectChanges();
      }, true
    );
    this.byStateAndVisible.subscribe(this.selection.selection$, () => this.changesDetection.detectChanges());
  }

  private trail$(trail$: Observable<Trail | null> | undefined, includeOsmMatch: boolean): Observable<TrailTracks> {
    if (!trail$) return of({trail: null, track: undefined, mapTrack: undefined, osmTrack: undefined, osmMapTrack: undefined, osmMarkedTrails: undefined});
    return trail$.pipe(
      switchMap(trail => {
        if (!trail) return of({trail: null, track: undefined, mapTrack: undefined, osmTrack: undefined, osmMapTrack: undefined, osmMarkedTrails: undefined});
        return this.showOriginal$.pipe(
          switchMap(original => {
            const uuid$ = original ? trail.originalTrackUuid$ : trail.currentTrackUuid$;
            return combineLatest([
              uuid$.pipe(
                switchMap(uuid => trail.fromModeration ?
                  this.injector.get(ModerationService).getFullTrack$(trail.uuid, trail.owner, uuid) :
                  this.trackService.getFullTrack$(uuid, trail.owner)
                ),
              ),
              this.reverseWay$
            ]).pipe(
              switchMap(([track, reverse]) => {
                if (!track) return of({trail, track: undefined, mapTrack: undefined, osmTrack: undefined, osmMapTrack: undefined, osmMarkedTrails: undefined});
                if (reverse) track = track.reverse();
                const mapTrack = new MapTrack(trail, track, 'red', 1, false, this.i18n);
                mapTrack.showArrowPath();
                if (!includeOsmMatch) return of({trail, track, mapTrack, osmTrack: undefined, osmMapTrack: undefined, osmMarkedTrails: undefined});
                return track.computed.osmWaysMatchPrependWithUndefined$().pipe(
                  switchMap(osm => {
                    this.hasOsmTrack = !!osm;
                    return this.showOsmTrack$.pipe(
                      map(showOsm => {
                        let osmMarkedTrails: MapMarkedTrail[] | undefined = undefined;
                        if (osm) {
                          const trails = buildMapMarkedTrails(this.injector, track, osm);
                          if (trails.length > 0) osmMarkedTrails = trails;
                        }
                        this.hasMapMarkedTrails = !!osmMarkedTrails;
                        if (!osm || !showOsm) return {trail, track, mapTrack, osmTrack: undefined, osmMapTrack: undefined, osmMarkedTrails};
                        const osmTrack = buildOsmTrack(track, osm.osmTrackPoints);
                        const osmMapTrack = new MapTrack(trail, osmTrack, 'red', 1, false, this.i18n);
                        osmMapTrack.showArrowPath();
                        return {trail, track, mapTrack, osmTrack, osmMapTrack, osmMarkedTrails};
                      })
                    )
                  })
                )
              })
            );
          })
        )
      })
    );
  }

  private listenForSource(): void {
    this._listenForSource(this.trail1WithInfo$);
    this._listenForSource(this.trail2WithInfo$);
  }
  private _listenForSource(trailWithInfo$: Observable<TrailWithInfo | null>) {
    this.whenVisible.subscribe(
      combineLatest([
        trailWithInfo$,
        this.injector.get(FetchSourceService).isReady$,
      ]).pipe(
        switchMap(([trailWithInfo]) => {
          if (!trailWithInfo) return of(undefined);
          const source: TrailSource = {
            isExternal: false,
            isExternalOnly: false,
            externalAppName: undefined,
            externalUrl: undefined,
            sourceString: undefined,
          }
          source.isExternal = trailWithInfo.trail.sourceType === TrailSourceType.EXTERNAL;
          if (source.isExternal) {
            source.isExternalOnly = !trailWithInfo.trail.owner.includes('@');
            source.externalUrl = trailWithInfo.trail.source;
            if (source.externalUrl?.startsWith(environment.baseUrl)) {
              if (trailWithInfo.trail.owner === 'trailence')
                source.externalUrl = undefined;
            }
            const plugin = source.externalUrl ? this.injector.get(FetchSourceService).getPluginByUrl(source.externalUrl) : undefined
            source.externalAppName = plugin?.name;
            if (source.externalAppName === 'Trailence' && source.externalUrl?.startsWith(environment.baseUrl))
              source.externalUrl = source.externalUrl.substring(environment.baseUrl.length);
            else if (plugin && trailWithInfo.trail.owner.includes('@'))
              source.internalUrl = plugin.getTrailenceUrlFromUrl(source.externalUrl!);
            if (plugin && source.externalUrl && plugin.externalUrlAllowedInFrame)
              source.externalSafeUrl = this.injector.get(DomSanitizer).bypassSecurityTrustResourceUrl(source.externalUrl); // NOSONAR
          }
          const followedTrail$ = this.getFollowedTrailInfo(trailWithInfo.trail);
          const info$ = trailWithInfo.trail.owner.includes('@') ? of(null) : this.injector.get(FetchSourceService).getTrailInfo$(trailWithInfo.trail.owner, trailWithInfo.trail.uuid);
          const infoAndPublishedFrom$ = info$.pipe(
            switchMap(info => {
              if (info?.myUuid) return this.trailService.getTrail$(info.myUuid, this.auth.email!).pipe(map(originalTrail => ([info, originalTrail] as [TrailInfo | null, Trail | null])));
              return of([info, null] as [TrailInfo | null, Trail | null]);
            })
          );
          return combineLatest([
            this.getSourceString(trailWithInfo.trail),
            infoAndPublishedFrom$,
            followedTrail$,
          ]).pipe(
            map(([sourceString, [info, originalTrail], followedInfo]) => {
              if ((source.externalAppName !== 'Trailence' && source?.externalUrl && !source.externalUrl.startsWith('http')) ||
                  (!source.externalUrl && info?.externalUrl))
                source.externalUrl = info?.externalUrl;
              source.sourceString = sourceString;
              source.info = info ?? undefined;
              source.followedInfo = followedInfo ?? undefined;
              source.publishedFromTrail = originalTrail ?? undefined;
              return {trailWithInfo, source};
            })
          );
        }),
      ),
      result => {
        if (result) result.trailWithInfo.source = result.source;
        this.toolbarItems = [...this.toolbarItems];
        this.changesDetection.detectChanges();
      }
    );
  }

  private getFollowedTrailInfo(trail: Trail): Observable<TrailInfo | null> {
    const url = trail.followedUrl;
    if (!url) return of(null);
    const plugin = this.injector.get(FetchSourceService).getPluginBySource(url);
    if (plugin?.owner === 'trailence')
      return this.injector.get(FetchSourceService).getTrailence$().pipe(
        switchMap(p => p ? from(p.fetchTrailInfoByUrl(url)) : of(null)),
      );
    return of(null);
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
              const plugin = this.injector.get(FetchSourceService).getPluginBySource(trail.followedUrl);
              if (!plugin) return s;
              const url = plugin.getTrailenceUrlFromUrl(trail.followedUrl) || trail.followedUrl;
              return new CompositeI18nString([s || new TranslatedString('pages.trail.source.following_a_deleted_track'), new TranslatedString('pages.trail.source.initially_found_on', [url, plugin.name])]);
            })
          ));
        } else if (trail.followedUrl) {
          const plugin = this.injector.get(FetchSourceService).getPluginBySource(trail.followedUrl);
          if (plugin) {
            if (trail.followedOwner === plugin.owner && !!trail.followedUuid && plugin.allowed) {
              src.push(of(new TranslatedString('pages.trail.source.following_found_on', ['/trail/' + trail.followedOwner + '/' + trail.followedUuid, plugin.name])));
            } else {
              src.push(of(new TranslatedString('pages.trail.source.following_found_on', [trail.followedUrl, plugin.name])));
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
        const plugin = this.injector.get(FetchSourceService).getPluginBySource(trail.source);
        if (plugin) {
          src.push(of(new TranslatedString('pages.trail.source.external', [plugin.name])));
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
      combineLatest([this.trail1$ ?? of(null), this.trail2$ ?? of(null), this.recording$ ?? of(null), this.auth.userChanged$]).pipe(
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

  private listenForPublished(): void {
    this.byStateAndVisible.subscribe(
      combineLatest([this.trail1$ ?? of(undefined), this.trail2$ ?? of(undefined), this.injector.get(MyPublicTrailsService).myPublicTrails$])
      .pipe(
        switchMap(([trail1, trail2, myPublicTrails]) => {
          if (trail1 && !trail2 && trail1.owner === this.auth.email) {
            const publicTrail = myPublicTrails.find(t => t.privateUuid === trail1.uuid);
            if (publicTrail)
              return this.injector.get(FetchSourceService).getTrail$('trailence', publicTrail.publicUuid);
          }
          return of(undefined);
        })
      ),
      (publicTrail) => {
        this.publishedTrail = publicTrail ?? undefined;
        this.changesDetection.detectChanges();
      }
    );
  }

  private listenCurrentPublic(): void {
    if (!this.trail1$) return;
    this.byStateAndVisible.subscribe(
      this.trail1$.pipe(
        filterDefined(),
        filter(t => t.fromModeration && !!t.publishedFromUuid),
        switchMap(t => this.injector.get(ModerationService).getPublicUuid(t.publishedFromUuid!, t.owner)), // NOSONAR
        take(1),
      ),
      uuid => {
        this.currentPublicTrailUuid = uuid;
        this.toolbarItems = [...this.toolbarItems];
        this.changesDetection.detectChanges();
      }
    );
  }

  private listenForLiveGroups(): void {
    this.byStateAndVisible.subscribe(
      combineLatest([this.trail1$ || of(undefined), this.trail2$ || of(undefined)]).pipe(
        switchMap(trails => {
          if (!trails[0] || trails[1]) return of([]);
          return this.injector.get(LiveGroupService).groups$.pipe(
            map(groups => groups ? groups.filter(g => g.trailOwner === trails[0]!.owner && g.trailUuid === trails[0]!.uuid) : [])
          );
        })
      ),
      groups => {
        if (groups.length === 0 && this.liveGroups$.value.length === 0) return;
        this.liveGroups$.next(groups);
        this.changesDetection.detectChanges();
      }
    )
  }
  getOpenedLiveGroup(): LiveGroupDto | undefined {
    if (!this.bottomSheetTab.startsWith('live-group-')) return undefined;
    return this.liveGroups$.value.find(g => g.slug === this.bottomSheetTab.substring(11));
  }

  private listenForTags(): void {
    this._listenForTags(this.trail1WithInfo$);
    this._listenForTags(this.trail2WithInfo$);
  }
  private _listenForTags(trailWithInfo$: Observable<TrailWithInfo | null>) {
    this.whenVisible.subscribe(
      trailWithInfo$.pipe(
        switchMap(trailWithInfo => {
          if (trailWithInfo && (trailWithInfo.trail.owner === this.auth.email || trailWithInfo.trail.owner.startsWith(SHARED_OWNER_PREFIX)))
            return this.tagService.getTrailTagsFullNames$(trailWithInfo.trail.owner, trailWithInfo.trail.uuid).pipe(map(tagsNames => ({trailWithInfo, tagsNames})));
          return of({trailWithInfo, tagsNames: undefined});
        }),
        debounceTimeExtended(0, 100)
      ),
      result => {
        if (!result.trailWithInfo) return;
        if (result.trailWithInfo.tagsNames === undefined && result.tagsNames === undefined) return;
        if (result.trailWithInfo.tagsNames !== undefined && result.tagsNames !== undefined && Arrays.sameContent(result.trailWithInfo.tagsNames, result.tagsNames)) return;
        result.trailWithInfo.tagsNames = result.tagsNames?.sort((t1, t2) => t1.localeCompare(t2, this.preferencesService.preferences.lang));
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
        this.changesDetection.detectChanges();
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
    const mapZoom$ = this.map$.pipe(
      switchMap(m => {
        const zoom$ = m?.getState()?.zoomInt$;
        if (!zoom$) return of(undefined);
        return zoom$.pipe(
          map(zoom => Math.floor(zoom)),
          distinctUntilChanged(),
        );
      })
    );
    let canDisplayError = true;
    this.byStateAndVisible.subscribe(
      combineLatest([this.trail1$ ?? of(null), this.trail2$ ?? of(null), this.recording$ ?? of(null), this.showPhotos$]).pipe(
        debounceTimeExtended(100, 100, 3),
        tap(() => canDisplayError = true),
        switchMap(([trail1, trail2, recording, showPhotos]) =>
          combineLatest([
            trail1 ? this.photoService.getTrailPhotos$(trail1) : of([]),
            trail2 ? this.photoService.getTrailPhotos$(trail2) : of([]),
            recording ? recording.photos$ as Observable<Photo[]> : of([]),
          ]).pipe(
            debounceTimeExtended(50, 100, 3),
            switchMap(([p1, p2, p3]) => combineLatest([
              trail1 && p1.length > 0 ? this.getPhotosWithPosition(p1, () => getTrack(trail1), dateToPoint) : of([]),
              trail2 && p2.length > 0 ? this.getPhotosWithPosition(p2, () => getTrack(trail2), dateToPoint) : of([]),
              recording && p3.length > 0 ? this.getPhotosWithPosition(p3, () => of(recording.track), dateToPoint) : of([]),
            ])),
            debounceTimeExtended(0, 100, 3),
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
            switchMap(photosWithPoint => combineLatest([of(photosWithPoint), mapZoom$])),
            debounceTimeExtended(0, 100, 3),
            switchMap(([photosWithPoint, zoom]) => {
              this.photosHavingPosition = photosWithPoint;
              this.trailsWaypoints.updatePhotos(photosWithPoint);
              if (photosWithPoint.length === 0 || !showPhotos) return of([]);
              const markers$: Observable<{key: string, marker: L.Marker} | undefined | null>[] = [];
              photosByKey.clear();
              let photosGroups: {photos: Photo[], point: L.LatLngExpression}[];
              if (zoom === undefined) photosGroups = photosWithPoint;
              else {
                photosGroups = [];
                for (const p of photosWithPoint) {
                  const point = L.CRS.EPSG3857.latLngToPoint(p.point, zoom);
                  const nearGroup = photosGroups.find(pg => L.CRS.EPSG3857.latLngToPoint(pg.point, zoom).distanceTo(point) < 35);
                  if (nearGroup)
                    nearGroup.photos.push(...p.photos);
                  else
                    photosGroups.push({photos: [...p.photos], point: p.point});
                }
              }
              for (const p of photosGroups) {
                const key = p.photos[0].owner + '#' + p.photos[0].uuid + '#' + p.photos.length;
                photosByKey.set(key, p.photos);
                let marker = photosOnMap.get(key);
                if (marker) {
                  markers$.push(of({key, marker}));
                } else {
                  markers$.push(this.createPhotoMarker(p.point, p.photos, photosByKey, key));
                }
              }
              return combineLatest(markers$).pipe(debounceTimeExtended(0, 500, 5));
            }),
          )
        ),
      ),
      result => {
        if (!this.map) return;
        const ok = result.filter(m => !!m);
        if (ok.length !== result.length && canDisplayError) {
          const noNet = result.filter(m => m === undefined);
          const msg = noNet.length > 0 ? 'photos_error_no_network' : 'photos_error';
          this.injector.get(ToastController).create({
            message: this.i18n.texts.errors[msg],
            color: 'warning',
            duration: 5000,
          }).then(t => t.present());
          canDisplayError = false;
        }
        const alreadyOnMap: string[] = [];
        for (const[key,marker] of photosOnMap) {
          if (ok.some(p => p.key === key))
            alreadyOnMap.push(key);
          else
            this.map.removeFromMap(marker);
        }
        photosOnMap.clear();
        for (const element of ok) {
          photosOnMap.set(element.key, element.marker);
          if (!alreadyOnMap.includes(element.key)) this.map.addToMap(element.marker);
        }
        this.changesDetection.detectChanges();
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

  private createPhotoMarker(point: L.LatLngExpression, photos: Photo[], photosByKey: Map<string, Photo[]>, key: string, withError: boolean = true): Observable<{key: string, marker: L.Marker} | undefined | null> {
    return this.photoService.getFile$(photos[0]).pipe(
      switchMap(blob => this.injector.get(WorkerService).convertToJpeg(blob, 75, 75, 0.7)),
      switchMap(jpeg => from(new BinaryContent(jpeg.blob).toBase64()).pipe(
        map(base64 => {
          const marker = MapPhoto.create(point, 'data:image/jpeg;base64,' + base64, jpeg.width, jpeg.height, photos.length > 1 ? '' + photos.length : undefined);
          marker.addEventListener('click', () => {
            this.photoService.openSliderPopup(photosByKey.get(key)!, 0);
          });
          return {key, marker};
        }),
      )),
      catchError(e => {
        if (!withError) return EMPTY;
        if (e instanceof ApiError && e.httpCode === 0) {
          // no network
          return concat(
            of(undefined),
            this.injector.get(NetworkService).server$.pipe(
              switchMap(connected => connected ? this.createPhotoMarker(point, photos, photosByKey, key, false) : EMPTY)
            )
          );
        }
        return of(null);
      })
    );
  }

  remaining$ = new BehaviorSubject<RemainingData | undefined>(undefined);

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
      combineLatest([
        trackChanges$,
        this.graph$,
        this._bottomSheetTab$,
        this.tracks$.pipe(map(tracks => tracks.at(0))),
        this.map$.pipe(switchMap(m => m ? m.ready$.pipe(map(r => r ? m.getMap() : undefined)) : of(undefined)))
      ])
      .pipe(
        debounceTimeExtended(
          1000,
          5000,
          50,
          (p, n) =>
            (!!n[0] && n[0].track.metadata.distance - previousDistance > 25) ||
            p[1] !== n[1] ||
            (!p[1]?.visible && !!n[1]?.visible) ||
            p[1]?.graphType !== n[1]?.graphType ||
            p[2] !== n[2] ||
            p[3] !== n[3] ||
            p[4] !== n[4]
        ),
        switchMap(([r, g, tab, track, _map]) => {
          previousDistance = r ? r.track.metadata.distance : 0;
          let remaining: Track | undefined = undefined;
          const pt = r?.track.arrivalPoint;
          let closestPoint: TrackPointReference | undefined = undefined;
          if (track === r?.track) track = undefined;
          if (pt && track) {
            closestPoint = TrackUtils.findNextClosestPointInTrack(pt.pos, track, 250, this.remaining$.value?.trackPosition ?? {segmentIndex: 0, pointIndex: 0});
            if (closestPoint) {
              remaining = track.subTrack(closestPoint.segmentIndex, closestPoint.pointIndex, track.segments.length - 1, track.segments.at(-1)!.points.length - 1);
            }
          }
          if (pt && this.graph) {
            this.graph.updateRecording(r.track, track, closestPoint?.segmentIndex, closestPoint?.pointIndex);
          }
          if (!remaining) return of({remaining, closestPoint, undefined, track, _map});
          return remaining.computed.timeEstimation$.pipe(first(), map(timeEstimation => ({remaining, closestPoint, timeEstimation, track, _map})))
        })
      ),
      r => {
        let polyline: L.Polyline | undefined = undefined;
        if (r.closestPoint && r._map) {
          if (!this.remaining$.value?.polyline || this.remaining$.value?.map !== r._map || this.remaining$.value?.trackPosition?.segmentIndex !== r.closestPoint.segmentIndex || this.remaining$.value?.trackPosition?.pointIndex !== r.closestPoint.pointIndex) {
            // update remaining on map
            if (this.remaining$.value?.polyline) {
              polyline = this.remaining$.value?.polyline;
              polyline.setLatLngs(r.remaining!.getAllPositions());
            } else {
              polyline = L.polyline(r.remaining!.getAllPositions(), {
                color: 'red',
                smoothFactor: 1,
                interactive: false,
                weight: 3,
              });
              polyline.addTo(r._map);
            }
            polyline.bringToBack();
          } else {
            polyline = this.remaining$.value.polyline;
          }
        }
        if (!polyline && this.remaining$.value?.polyline) {
          this.remaining$.value.polyline.remove();
        }
        const baseMapTrack = this.mapElements$.value.find(mt => mt instanceof MapTrack && mt.track === r.track) as MapTrack | undefined;
        if (baseMapTrack) baseMapTrack.color = r.remaining ? '#FF000080' : 'red';
        if (r.remaining) {
          this.remaining$.next({
            originalTime: r.remaining.metadata.duration,
            estimatedTime: r.timeEstimation.total,
            distance: r.remaining.metadata.distance,
            ascent: r.remaining.metadata.positiveElevation,
            descent: r.remaining.metadata.negativeElevation,
            track: r.track!,
            trackPosition: r.closestPoint!,
            subTrack: r.remaining,
            polyline,
            map: r._map,
          });
        } else if (this.remaining$.value) {
          this.remaining$.next(undefined);
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
        this.currentLang = this.preferencesService.preferences.lang;
        this.toolbarItems = [...this.toolbarItems];
        this.refreshMapToolbarTop();
        this.refreshMapToolbarRight();
        this.changesDetection.detectChanges();
      },
      true
    );
  }

  private listenForCollections(): void {
    this._listenForCollections(this.trail1WithInfo$, true);
    this._listenForCollections(this.trail2WithInfo$, false);
  }
  private _listenForCollections(trailWithInfo$: Observable<TrailWithInfo | null>, isTrail1: boolean): void {
    this.whenVisible.subscribe(
      this.auth.userChanged$.pipe(
        switchMap(auth => trailWithInfo$.pipe(
          switchMap(trailWithInfo => {
            if (!trailWithInfo) return of({auth, col: null, trailWithInfo: null, track: null});
            if (!trailWithInfo.trail.owner.includes('@') || trailWithInfo.trail.fromModeration)
              return of({auth, col: null, trailWithInfo, track: null});
            return combineLatest([
              auth ? this.injector.get(TrailCollectionService).getCollectionWithName$(trailWithInfo.trail.collectionUuid, auth.email) : of(null),
              isTrail1 ? this.trackService.getFullTrackReady$(trailWithInfo.trail.currentTrackUuid, trailWithInfo.trail.owner) : of(null),
            ]).pipe(
              map(([col, track]) => ({auth, col, trailWithInfo, track}))
            );
          }),
        )),
      ),
      result => {
        if (result.trailWithInfo) {
          result.trailWithInfo.collection = result.col?.collection;
          result.trailWithInfo.collectionName = result.col?.name;
          this.isPublication = isPublicationCollection(result.col?.collection?.type);
          if (result.track && result.col?.collection?.type === TrailCollectionType.PUB_DRAFT) {
            if (!this.publicationChecklist || this.publicationChecklist.trailUuid !== result.trailWithInfo.trail.uuid || this.publicationChecklist.trailOwner !== result.trailWithInfo.trail.owner)
              this.publicationChecklist = PublicationChecklist.load(result.trailWithInfo.trail, result.track, this.trailService);
          } else {
            this.publicationChecklist = undefined;
          }
          if (isTrail1)
            this.editable = !this.trail2 && !!result.auth &&
              (result.trailWithInfo.trail.fromModeration ||
               (result.trailWithInfo.trail.owner === result.auth.email && result.col?.collection.type !== TrailCollectionType.PUB_SUBMIT) ||
               result.trailWithInfo.trail.owner.startsWith(SHARED_OWNER_PREFIX)
              );
        } else if (isTrail1) {
          this.isPublication = false;
          this.publicationChecklist = undefined;
          this.editable = false;
        }
        this.changesDetection.detectChanges();
      }
    );
  }

  private listenForCommentsCount(): void {
    this.whenVisible.subscribe(
      this.trail1WithInfo$.pipe(
        filter(t => !!t && t.trail.owner === 'trailence'),
        switchMap(trail1Info =>
          this.injector.get(FeedbackService).countFeedbacks(trail1Info!.trail.uuid).pipe(
            map(count => ({trail1Info, count}))
          )
        )
      ),
      result => {
        result.trail1Info!.feedbackCount = result.count;
        this.changesDetection.detectChanges();
      }
    );
  }

  private updateDisplay(): void {
    if (!this.visible) {
      this.updateVisibility(false, false, false);
      return;
    }
    const w = this.browser.width;
    const h = this.browser.height;
    if (w >= 750 + 350) {
      this.displayMode = 'large';
      this.isSmall = false;
      if (this.bottomSheetTab === 'info') this.bottomSheetTab = 'elevation';
      if (!LARGE_TABS.includes(this.tab)) this.tab = 'map';
      this.updateVisibility(this.tab === 'map', this.tab === 'map' && this.bottomSheetOpen, true);
    } else {
      this.displayMode = h > 500 || w < 500 ? 'small' : 'small small-height bottom-sheet-tab-open-' + this.bottomSheetTab;
      this.isSmall = true;
      this.updateVisibility(this.tab === 'map', this.tab === 'map' && (this.bottomSheetTab === 'elevation' || this.bottomSheetTab === 'speed'), this.tab === 'details');
    }
    this.mapToolbarTopRightMaxItems = w > 600 ? undefined : Math.floor((w - 90) / 48);
    this.maxBottomSheetHeight = Math.min(h - 100, 350);
    if (this.maxBottomSheetHeight < 200 && this.bottomSheetCustomHeight) {
      this.reduceBottomSheet();
    }
    this.changesDetection.detectChanges();
  }

  private updateVisibility(mapVisible: boolean, graphVisible: boolean, detailsVisible: boolean): void {
    for (const child of this._children$.value) {
      if (child instanceof MapComponent) child.setVisible(mapVisible);
      else if (child instanceof TrailGraphComponent) child.setVisible(graphVisible);
      else if (child instanceof TrackOsmStatsComponent) child.setVisible(detailsVisible);
    }
  }

  protected override getChildVisibility(child: AbstractComponent): boolean | undefined {
    if (child instanceof MapComponent) return this.tab === 'map';
    if (child instanceof TrailGraphComponent)
      return this.tab === 'map' && (this.bottomSheetTab === 'elevation' || this.bottomSheetTab === 'speed');
    if (child instanceof TrackOsmStatsComponent)
      return !this.isSmall || this.tab === 'details';
    return undefined;
  }

  protected override _propagateVisible(visible: boolean): void {
    // no
  }

  private setTab(tab: TAB_TYPE): void {
    if (tab === this.tab || !this.allowedTabs().includes(tab)) return;
    this.tab = tab;
    this.updateDisplay();
  }
  setTabString(tab: string): void {
    if (!this.allowedTabs().includes(tab)) {
      Console.error('Invalid tab value', tab);
      return;
    }
    this.setTab(tab as TAB_TYPE);
  }

  private allowedTabs(): string[] {
    return this.isSmall ? ALL_TABS : LARGE_TABS;
  }

  openBottomSheet(): void {
    this.bottomSheetCustomHeight = undefined;
    this.bottomSheetOpen = true;
    this.updateDisplay();
    setTimeout(() => this.map?.invalidateSize(), 500);
  }

  closeBottomSheet(): void {
    this.bottomSheetCustomHeight = undefined;
    this.bottomSheetOpen = false;
    this.updateDisplay();
    setTimeout(() => this.map?.invalidateSize(), 500);
  }

  enlargeBottomSheet(): void {
    this.bottomSheetCustomHeight = this.maxBottomSheetHeight! + 'px';
    this.bottomSheetOpen = true;
    this.updateDisplay();
    setTimeout(() => {
      this.map?.invalidateSize();
      this.graph?.resetChart();
    }, 500);
  }

  reduceBottomSheet(): void {
    this.bottomSheetCustomHeight = undefined;
    this.bottomSheetOpen = true;
    this.updateDisplay();
    setTimeout(() => {
      this.map?.invalidateSize();
      this.graph?.resetChart();
    }, 500);
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
      if (this.publicTrailsAroundMapTracks$.value.includes(ref.track)) {
        window.open(environment.baseUrl + '/trail/trailence/' + ref.track.trail!.uuid, '_blank');
      }
    }
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
    this.setTab('map');

    this.trailsWaypoints.showBreaksOnMapLocked = true;
    this.trailsWaypoints.updateElementsShown();
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
      this.trailsWaypoints.updateElementsShown();
      if (showPhotosBefore) this.showPhotos$.next(true);
      if (showOriginalBefore) this.showOriginal$.next(true);
      this.refreshMapToolbarRight();
      this.changesDetection.detectChanges();
      this.setTab('photos');
    });
  }

  openSlider(): void {
    this.photoService.openSliderPopup(this.photos!, 0);
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
      import('../../services/functions/map-download').then(m => m.openMapDownloadDialog(this.injector, [trail], undefined, this.map$.value?.getState().tilesName));
    }
  }

  async openTags(trail: Trail) {
    const r = await Promise.all([
      firstValueFrom(
        this.auth.userChanged$.pipe(
          switchMap(auth => auth && !auth.isAnonymous ? this.injector.get(TrailCollectionService).getCollection$(trail.collectionUuid, auth.email) : of(undefined)),
          filterDefined(),
        )
      ),
      import('../tags/tags.component')
    ]);
    r[1].openTagsDialog(this.injector, [trail], r[0]);
  }

  editTrailName(trail: Trail): void {
    if (!this.editable) return;
    import('../../services/functions/trail-rename').then(m => m.openRenameTrailDialog(this.injector, trail));
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
    if (this._lock) {
      this._lock();
      this._lock = undefined;
      this.editingDescription = false;
      this.editingSourceUrl = false;
    }
    this.trailService.lock(this.trail1.uuid, this.trail1.owner, (locked, unlock) => {
      if (!locked) return;
      this._lock = unlock;
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
      if (this.trail1.description !== text && this._lock) {
        this.trail1.description = text;
        this.trailService.update(this.trail1, () => {
          if (this._lock) {
            this._lock();
            this._lock = undefined;
          }
        });
      }
    }
    this.changesDetection.detectChanges();
  }


  startEditSourceUrl(): void {
    if (!this.trail1) return;
    if (this._lock) {
      this._lock();
      this._lock = undefined;
      this.editingDescription = false;
      this.editingSourceUrl = false;
    }
    this.trailService.lock(this.trail1.uuid, this.trail1.owner, (locked, unlock) => {
      if (!locked) return;
      this._lock = unlock;
      this.editingSourceUrl = true;
      this.changesDetection.detectChanges(() => {
        setTimeout(() => {
          if (this.sourceUrlEditor) this.sourceUrlEditor.setFocus();
        }, 0);
      });
    });
  }

  endEditSourceUrl(text: string | null | undefined): void {
    this.editingSourceUrl = false;
    if (text !== null && text !== undefined && this.trail1) {
      text = text.trim();
      if (text.length === 0 || !text.toLowerCase().startsWith('https://')) text = undefined;
      if (this.trail1.sourceUrl !== text && this._lock) {
        this.trail1.sourceUrl = text;
        this.trailService.update(this.trail1, () => {
          if (this._lock) {
            this._lock();
            this._lock = undefined;
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
    this.injector.get(TrailMenuService).openTrailDatePopup(this.trail1, this.tracks$.value[0]);
  }

  openActivityDialog(): void {
    const trail = !!this.trail1 && !this.trail2 && this.editable && !this.recording ? {trail: this.trail1, isRecording: false} : !this.trail1 && this.recording ? {trail: this.recording.trail, isRecording: true} : undefined;
    if (!trail) return;
    import('../activity-popup/activity-popup.component')
    .then(m => m.openActivityDialog(this.injector, [trail.trail], trail.isRecording))
    .then(() => this.refreshMapToolbarTop());
  }

  openPublish(): void {
    this.injector.get(TrailMenuService).startPublication(this.trail1!);
  }

  canEdit(): boolean {
    if (!this.editable) return false;
    if (this.toolsEnabled) return false;
    if (this.trail2) return false;
    if (this.trail1?.owner !== this.auth.email && !this.trail1?.fromModeration && !this.trail1?.owner?.startsWith(SHARED_OWNER_PREFIX)) return false;
    if (this.recording) return false;
    if (this.showOsmTrack$.value) return false;
    return true;
  }

  highlightWayPoint(wp: TrackWayPoint, click: boolean): void {
    this.trailsWaypoints.highlightWayPoint(wp, click);
    this.changesDetection.detectChanges();
  }

  unhighlightWayPoint(wp: TrackWayPoint, force: boolean): void {
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
    if (this.trail1WithInfo?.source?.externalUrl?.startsWith(environment.baseUrl + '/trail/trailence/'))
      this.injector.get(Router).navigate([this.trail1WithInfo?.source.externalUrl.substring(environment.baseUrl.length)], {fragment: 'rate'});
    else if (this.trail1?.followedUrl?.startsWith(environment.baseUrl + '/trail/trailence/'))
      this.injector.get(Router).navigate([this.trail1.followedUrl.substring(environment.baseUrl.length)], {fragment: 'rate'});
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
        service.validateAndPublish(trail, track, photos, (ok) => {
          if (ok)
            this.injector.get(Router).navigateByUrl('/trails/moderation');
        });
      });
    } else {
      this.publicationChecklist?.delete();
      const trail = this.trail1!
      const fromCollection = this.injector.get(TrailCollectionService).getCollection(trail.collectionUuid, trail.owner)!;
      const toCollection = await firstValueFrom(this.injector.get(TrailCollectionService).getOrCreatePublicationSubmit());
      const copyModule = await import('../../services/functions/copy-trails');
      copyModule.moveTrailsTo(this.injector, [trail], fromCollection, toCollection, t => t.publicationMessageFromAuthor = result.data, true);
      this.injector.get(Router).navigateByUrl('/trails/collection/' + this.trail1WithInfo!.collection!.uuid + '/' + this.trail1WithInfo!.collection!.owner);
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
    const trail = this.trail1!
    const fromCollection = this.injector.get(TrailCollectionService).getCollection(trail.collectionUuid, trail.owner)!;
    const toCollection = await firstValueFrom(this.injector.get(TrailCollectionService).getOrCreatePublicationDraft());
    const copyModule = await import('../../services/functions/copy-trails');
    copyModule.moveTrailsTo(this.injector, [trail], fromCollection, toCollection);
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
          .then(m => m.copyTrailsTo(this.injector, [this.trail1!], col, true, true, true, (newTrail) => ({
            publishedFromUuid: this.trail1WithInfo?.source?.info?.myUuid,
            sourceType: this.trail1WithInfo?.source?.info?.externalUrl ? TrailSourceType.EXTERNAL : undefined,
            source: this.trail1WithInfo?.source?.info?.externalUrl
          })))
        });
      }
    });
    await alert.present();
  }

  private async cancelPublication() {
    const module = await import('../../services/functions/delete-trails');
    const confirm = await module.confirmDeleteTrails(this.injector, [this.trail1!], true);
    if (confirm) this.publicationChecklist?.delete();
  }

  private async deletePublication() {
    const confirm = await this.injector.get(AlertController).create({
      header: this.i18n.texts.publications.remove_publication_title,
      message: this.i18n.texts.publications.remove_publication_message,
      inputs: [{
        type: 'textarea',
        attributes: {
          minLength: 25,
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
            if (message.length < 25) return false;
            this.injector.get(AlertController).dismiss(message, 'confirm');
            return true;
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

    this.injector.get(HttpService).postString(environment.apiBaseUrl + '/public/trails/v1/trail/' + this.trail1!.uuid + '/requestRemove', result.data)
    .subscribe({
      complete: () => {
        this.injector.get(ToastController).create({
          message: this.i18n.texts.publications.remove_publication_sent,
          duration: 10000,
          color: 'success',
        })
        .then(toast => toast.present());
      },
      error: e => {
        Console.error('Error sending remove request for public trail', e);
        this.injector.get(ErrorService).addNetworkError(e, 'publications.remove_publication_error', []);
      }
    });
  }

  private async compareToPublicTrail() {
    const trailence = this.injector.get(FetchSourceService).getTrailence();
    const trail = await trailence?.getTrail(this.currentPublicTrailUuid!);
    if (trail)
      (this.trail2$ as BehaviorSubject<Trail | null>).next(trail);
  }

  private async exitCompareToPublicTrail() {
    (this.trail2$ as BehaviorSubject<Trail | null>).next(null);
  }

  private _translationsReady = false;
  translationsReadyChanged(ready: boolean): void {
    this._translationsReady = ready;
    this.toolbarItems = [...this.toolbarItems];
    this.changesDetection.detectChanges();
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

  highlightedMapTrackSections: MapTrack[] = [];
  highlightSections(event: {track: Track, sections: TrackSection[]} | null): void {
    const sizeBefore = this.mapElements$.value.length;
    Arrays.removeAll(this.mapElements$.value, this.highlightedMapTrackSections);
    let changed = this.mapElements$.value.length != sizeBefore;
    if (event) {
      this.highlightedMapTrackSections = event.sections.map(section => this.buildMapTrack(event.track, section));
      this.mapElements$.value.push(...this.highlightedMapTrackSections);
      changed = true;
    }
    if (changed) this.mapElements$.next(this.mapElements$.value);
    if (event && changed) this.setTab('map');
  }

  private buildMapTrack(track: Track, section: TrackSection): MapTrack {
    const sectionTrack: SimplifiedTrackSnapshot = { points: [] };
    for (let si = section.start.segmentIndex; si <= section.end.segmentIndex; ++si) {
      const segment = track.segments[si].points;
      const start = si === section.start.segmentIndex ? section.start.pointIndex : 0;
      const end = si === section.end.segmentIndex ? section.end.pointIndex : segment.length - 1;
      for (let pi = start; pi <= end; ++pi) {
        const point = segment[pi];
        sectionTrack.points.push({lat: point.pos.lat, lng: point.pos.lng});
      }
    }
    const mt = new MapTrack(undefined, sectionTrack, 'yellow', 1, false, this.i18n, 3);
    return mt;
  }

}
