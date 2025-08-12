import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Injector, Input, Output, SimpleChanges } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { TrackMetadataComponent, TrackMetadataConfig } from '../track-metadata/track-metadata.component';
import { Track } from 'src/app/model/track';
import { CommonModule } from '@angular/common';
import { TrackService } from 'src/app/services/database/track.service';
import { IonIcon, IonCheckbox, IonButton, IonSpinner, PopoverController, DomController } from "@ionic/angular/standalone";
import { BehaviorSubject, combineLatest, firstValueFrom, map, Observable, of, switchMap } from 'rxjs';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MenuContentComponent } from '../menus/menu-content/menu-content.component';
import { TagService } from 'src/app/services/database/tag.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { TrailMenuService } from 'src/app/services/database/trail-menu.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { Arrays } from 'src/app/utils/arrays';
import { AssetsService } from 'src/app/services/assets/assets.service';
import { BrowserService } from 'src/app/services/browser/browser.service';
import { PhotoService } from 'src/app/services/database/photo.service';
import { Photo } from 'src/app/model/photo';
import { PhotosSliderComponent } from "../photos-slider/photos-slider.component";
import { Router } from '@angular/router';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { TrailInfo } from 'src/app/services/fetch-source/fetch-source.interfaces';
import { OsmcSymbolService } from 'src/app/services/geolocation/osmc-symbol.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { RateComponent } from '../trail/rate-and-comments/rate/rate.component';
import { MyPublicTrailsService } from 'src/app/services/database/my-public-trails.service';
import { MySelectionService } from 'src/app/services/database/my-selection.service';
import { LongPressDirective } from 'src/app/utils/long-press.directive';
import { TrailTag } from 'src/app/model/trail-tag';
import { TrailSmallMapComponent } from '../trail-small-map/trail-small-map.component';
import { TrackMetadataSnapshot } from 'src/app/model/snapshots';

class Meta {
  name?: string;
  dateValue?: number;
  dateString?: string;
  location?: string;
  loopTypeValue?: string;
  loopTypeString?: string;
  loopTypeIconValue?: string;
  loopTypeIconString?: string;
  activityValue?: string;
  activityString?: string;
  activityIconValue?: string;
  activityIconString?: string;
  isInMySelection?: boolean;
}

@Component({
    selector: 'app-trail-overview',
    templateUrl: './trail-overview.component.html',
    styleUrls: ['./trail-overview.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
      IonSpinner, IonButton, IonCheckbox, IonIcon,
      CommonModule,
      PhotosSliderComponent, TrailSmallMapComponent,
      RateComponent,
      LongPressDirective,
    ]
})
export class TrailOverviewComponent extends AbstractComponent {

  @Input() trail?: Trail;
  @Input() refreshMode: 'live' | 'snapshot' = 'snapshot';
  @Input() fromCollection = true;
  @Input() isAllCollections = false;
  @Input() isModeration = false;
  @Input() trackSnapshot: TrackMetadataSnapshot | null | undefined;
  @Input() trailInfo: TrailInfo | null | undefined;
  @Input() trailTags?: TrailTag[];

  @Input() selectable = false;
  @Input() selected = false;
  @Output() selectedChange = new EventEmitter<boolean>();

  @Input() config?: TrackMetadataConfig;
  @Input() photoEnabled = true;
  @Input() hasFixedHeight = false;
  @Input() photoCanBeOnLeft = true;
  @Input() alwaysShowLocation = false;
  @Input() smallMapEnabled = false;

  @Input() delayLoading = false;

  @Input() showPublished = false;
  @Input() hideMenu = false;

  @Input() navigationIndex?: number;
  @Input() navigationCount?: number;
  @Output() navigationIndexChange = new EventEmitter<number>();

  @Input() enableShowOnMap = false;
  @Output() showOnMap = new EventEmitter<Trail>();

  @Input() linkWithSlug = false;
  @Input() dateWithoutTime = false;

  @Input() renameOnTrailNamePress = false;
  trailNamePressed(): void {
    if(this.renameOnTrailNamePress && this.trail)
      import('../../services/functions/trail-rename').then(m => {
        if (this.trail) m.openRenameTrailDialog(this.injector, this.trail);
      });
  }

  id = IdGenerator.generateId();
  meta: Meta = new Meta();
  track$ = new BehaviorSubject<Track | TrackMetadataSnapshot | undefined>(undefined);
  fullTrack?: Track;
  tagsNames: string[] = [];
  photos: Photo[] = [];
  openUrl?: string;
  load$ = new BehaviorSubject<boolean>(false);
  observer?: IntersectionObserver;

  external?: TrailInfo;
  publicTrailUuid?: string;

  constructor(
    injector: Injector,
    private readonly trackService: TrackService,
    private readonly i18n: I18nService,
    private readonly changeDetector: ChangeDetectorRef,
    public trailMenuService: TrailMenuService,
    private readonly tagService: TagService,
    public readonly auth: AuthService,
    private readonly trailService: TrailService,
    private readonly browser: BrowserService,
    private readonly assets: AssetsService,
    private readonly popoverController: PopoverController,
    private readonly domController: DomController,
    private readonly photoService: PhotoService,
    private readonly router: Router,
    private readonly preferencesService: PreferencesService,
    private readonly mySelectionService: MySelectionService,
  ) {
    super(injector);
    this.changeDetector.detach();
  }

  protected override getComponentState() {
    return {
      trail: this.trail,
      trackSnapshot: this.trackSnapshot,
      mode: this.refreshMode,
      trailInfo: this.trailInfo,
      trailTags: this.trailTags,
      photoEnabled: this.photoEnabled,
      smallMapEnabled: this.smallMapEnabled,
    }
  }

  protected override onChangesBeforeCheckComponentState(changes: SimpleChanges): void {
    if (changes['selected'] || changes['enableShowOnMap'] || changes['hideMenu']) this.changeDetector.detectChanges();
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.reset();
    if (this.trail) {
      if (this.linkWithSlug && this.trailInfo?.externalUrl)
        this.openUrl = this.trailInfo.externalUrl;
      else
        this.openUrl = '/trail/' + this.trail.owner + '/' + this.trail.uuid;
      if (this.trail.fromModeration) this.openUrl += '/moderation';
      let previousI18nState = 0;
      const owner = this.trail.owner;
      this.byStateAndVisible.subscribe(
        this.load$.pipe(
          filterDefined(),
          switchMap(() =>
            combineLatest([
              this.i18n.stateChanged$,
              this.trail!.name$,
              this.trail!.location$,
              this.trail!.date$,
              this.trail!.loopType$,
              this.trail!.activity$,
              this.trackData$(this.trail!, owner),
              this.auth.auth ?
                this.mySelectionService.getMySelection().pipe(
                  map(sel => sel.findIndex(s => s.owner === this.trail!.owner && s.uuid === this.trail!.uuid) >= 0),
                ) : of(false)
            ])
          ),
          debounceTimeExtended(0, 10)
        ),
        ([i18nState, trailName, trailLocation, trailDate, loopType, activity, [track, trackStartDate], isInMySelection]) => {
          const force = i18nState !== previousI18nState;
          let changed = force;
          previousI18nState = i18nState;
          if (track != this.track$.value) {
            if (this.smallMapEnabled) this.fullTrack = track as Track;
            this.track$.next(track);
            changed = true;
          }
          if (this.updateMeta(this.meta, 'name', trailName, undefined, force)) changed = true;
          if (this.updateMeta(this.meta, 'location', trailLocation, undefined, force)) changed = true;
          if (this.updateMeta(this.meta, 'date', trailDate ?? trackStartDate, timestamp => this.dateWithoutTime ? this.i18n.timestampToDateString(timestamp) : this.i18n.timestampToDateTimeString(timestamp), force)) changed = true;
          if (this.updateMeta(this.meta, 'loopType', loopType, type => type ? this.i18n.texts.loopType[type] : '', force)) changed = true;
          if (this.updateMeta(this.meta, 'loopTypeIcon', loopType, type => this.trailService.getLoopTypeIcon(type), force)) changed = true;
          if (this.updateMeta(this.meta, 'activity', activity, activity => activity ? this.i18n.texts.activity[activity] : '', force)) changed = true;
          if (this.updateMeta(this.meta, 'activityIcon', activity, activity => this.trailService.getActivityIcon(activity), force)) changed = true;
          if (this.meta.isInMySelection !== isInMySelection) {
            this.meta.isInMySelection = isInMySelection;
            changed = true;
          }
          if (changed) this.changeDetector.detectChanges();
          if (!this._trackMetadataInitialized && track) this.initTrackMetadata();
        },
        true
      );
      if (owner === this.auth.email) {
        this.byStateAndVisible.subscribe(
          this.load$.pipe(
            filterDefined(),
            switchMap(() => {
              if (this.trailTags !== undefined)
                return this.tagService.getTagsFullnames$(this.trailTags.map(t => t.tagUuid));
              return this.tagService.getTrailTagsFullNames$(this.trail!.uuid);
            }),
            debounceTimeExtended(0, 100)
          ),
          tagsNames => {
            if (!Arrays.sameContent(tagsNames, this.tagsNames)) {
              this.tagsNames = tagsNames.sort((t1, t2) => t1.localeCompare(t2, this.preferencesService.preferences.lang));
              this.changeDetector.detectChanges();
            }
          },
          true
        );
      }
      if (this.photoEnabled) {
        this.byStateAndVisible.subscribe(
          this.load$.pipe(
            filterDefined(),
            switchMap(() => this.photoService.getTrailPhotos$(this.trail!))
          ),
          photos => {
            photos.sort((p1, p2) => {
              if (p1.isCover) return -1;
              if (p2.isCover) return 1;
              return p1.index - p2.index;
            });
            this.photos = photos;
            this.changeDetector.detectChanges();
          }
        );
      }
      if (this.trail.owner.indexOf('@') < 0) {
        if (this.trailInfo !== undefined) this.external = this.trailInfo ?? undefined;
        else
        this.byStateAndVisible.subscribe(
          this.load$.pipe(
            filterDefined(),
            switchMap(() => this.injector.get(FetchSourceService).getTrailInfo$(this.trail!.owner, this.trail!.uuid))
          ),
          info => {
            const v = info ?? undefined;
            if (this.external === v) return;
            this.external = v;
            this.changeDetector.detectChanges();
          }
        );
      }
      if (this.showPublished) {
        this.byStateAndVisible.subscribe(
          this.load$.pipe(
            filterDefined(),
            switchMap(() => this.injector.get(MyPublicTrailsService).myPublicTrails$)
          ),
          myPublicTrails => {
            const newValue = this.trail?.uuid ? myPublicTrails.find(p => p.privateUuid === this.trail?.uuid)?.publicUuid : undefined;
            if (newValue !== this.publicTrailUuid) {
              this.publicTrailUuid = newValue;
              this.changeDetector.detectChanges();
            }
          }
        );
      }
      if (this.delayLoading && !this.load$.value && !this.observer) {
        this.observer = new IntersectionObserver(entries => {
          if (this.observer && entries[0].isIntersecting) {
            this.observer.disconnect();
            this.observer = undefined;
            this.load$.next(true);
          }
        });
        this.observer.observe(this.injector.get(ElementRef).nativeElement);
      }
      if (!this.load$.value) this.changeDetector.detectChanges();
    }
  }

  private trackData$(trail: Trail, owner: string): Observable<[TrackMetadataSnapshot | Track | undefined, number | undefined]> {
    if (this.trackSnapshot && this.refreshMode !== 'live' && !this.smallMapEnabled)
      return of([this.trackSnapshot, this.trackSnapshot.startDate]);
    return trail.currentTrackUuid$.pipe(
      switchMap(uuid => this.refreshMode === 'live' || this.smallMapEnabled ? this.trackService.getFullTrack$(uuid, owner) : this.trackService.getMetadata$(uuid, owner)),
      switchMap(track => {
        if (!track) return of([undefined, undefined] as [undefined, undefined]);
        if (track instanceof Track) return combineLatest([of(track), track.metadata.startDate$]);
        return of([track, track.startDate] as [TrackMetadataSnapshot, number | undefined]);
      })
    );
  }

  private updateMeta(meta: any, key: string, value: any, toString: ((value: any) => string) | undefined, forceChange: boolean): boolean {
    if (!toString) {
      if (!forceChange && meta[key] === value) return false;
      meta[key] = value;
      return true;
    }
    if (!forceChange && meta[key  + 'Value'] === value) return false;
    meta[key + 'Value'] = value;
    meta[key + 'String'] = toString(value);
    return true;
  }

  private reset(): void {
    this.meta = new Meta();
    this.track$.next(undefined);
    this.tagsNames = [];
    this.photos = [];
    this.external = undefined;
    this.publicTrailUuid = undefined;
    this._trackMetadataInitialized = false;
    const element = document.getElementById('track-metadata-' + this.id);
    if (element) {
      while (element.previousElementSibling) element.parentElement!.removeChild(element.previousElementSibling);
    }
    if (!this.delayLoading && !this.load$.value)
      this.load$.next(true);
  }

  protected override destroyComponent(): void {
    this.observer?.disconnect();
    this.observer = undefined;
  }

  private _trackMetadataInitialized = false;
  private initTrackMetadata(): void {
    this._trackMetadataInitialized = true;
    const element = document.getElementById('track-metadata-' + this.id);
    TrackMetadataComponent.init(element!.parentElement!, element!, this.track$, of(undefined), this.config!, this.assets, this.i18n, this.whenVisible, this.domController);
  }

  setSelected(selected: boolean) {
    if (selected === this.selected) return;
    this.selected = selected;
    this.selectedChange.emit(selected);
  }

  async openMenu(event: MouseEvent) {
    event.stopPropagation();
    const y = event.pageY;
    const h = this.browser.height;
    const remaining = h - y - 15;
    const collection = this.fromCollection ?
      await firstValueFrom(
        this.injector.get(TrailCollectionService).getCollection$(this.trail!.collectionUuid, this.injector.get(AuthService).email ?? '').pipe(filterDefined())
      ) : undefined;
    const menu = this.trailMenuService.getTrailsMenu([this.trail!], false, collection, false, this.isAllCollections, this.isModeration);
    let estimatedHeight = 16;
    for (const item of menu) {
      if (item.isSeparator()) estimatedHeight += 2;
      else estimatedHeight += 31;
    }
    if (menu.length && menu[0].isSectionTitle()) {
      // if items become toolbars, we should take it into account
      const i1 = menu.findIndex((item, index) => index > 0 && (item.isSeparator() || item.isSectionTitle()));
      if (i1 <= 6 && i1 > 0) {
        estimatedHeight = estimatedHeight - i1 * 31 + 80;
        const i2 = menu.findIndex((item, index) => index > i1 && (item.isSeparator() || item.isSectionTitle()));
        if (i2 > 0 && (i2 - i1) <= 6) {
          estimatedHeight = estimatedHeight - (i2 - i1) * 31 + 80;
        }
      }
    }
    const offsetY = estimatedHeight <= remaining ? 0 : Math.max(-y + 25, remaining - estimatedHeight);
    const maxHeight = remaining - offsetY;

    const popover = await this.popoverController.create({
      component: MenuContentComponent,
      componentProps: {
        menu,
        enableToolbarsForSections: 2,
      },
      cssClass: 'always-tight-menu',
      event: event,
      side: 'right',
      dismissOnSelect: true,
    });
    popover.style.setProperty('--offset-y', offsetY + 'px');
    popover.style.setProperty('--max-height', maxHeight + 'px');
    await popover.present();
  }

  openPhotos(slider: PhotosSliderComponent): void {
    this.photoService.openSliderPopup(this.photos, slider.index);
  }

  openTrail(): void {
    if (this.trail?.fromModeration)
      this.router.navigate(['trail', this.trail.owner, this.trail.uuid, 'moderation'], {queryParams: { from: this.router.url }});
    else
      this.router.navigate(['trail', this.trail!.owner, this.trail!.uuid], {queryParams: { from: this.router.url }});
  }

  openPublicTrail(): void {
    if (!this.publicTrailUuid) return;
    this.router.navigate(['trail', 'trailence', this.publicTrailUuid], {queryParams: { from: this.router.url }});
  }

  private _symbol?: string;
  private _generatedSymbol?: SafeHtml;
  generateRouteSymbol(symbol: string): SafeHtml | undefined {
    if (this._symbol === symbol) return this._generatedSymbol!;
    const svg = this.injector.get(OsmcSymbolService).generateSymbol(symbol);
    this._symbol = symbol;
    this._generatedSymbol = this.injector.get(DomSanitizer).bypassSecurityTrustHtml(svg);
    return this._generatedSymbol;
  }

  navigationPrevious(): void {
    if (this.navigationIndex === undefined || !this.navigationCount) return;
    if (--this.navigationIndex < 0) this.navigationIndex = this.navigationCount - 1;
    this.navigationIndexChange.emit(this.navigationIndex);
  }

  navigationNext(): void {
    if (this.navigationIndex === undefined || !this.navigationCount) return;
    if (++this.navigationIndex >= this.navigationCount) this.navigationIndex = 0;
    this.navigationIndexChange.emit(this.navigationIndex);
  }

  toggleMySelection(): void {
    if (!this.trail) return;
    const newValue = !this.meta.isInMySelection;
    this.meta.isInMySelection = newValue;
    if (!newValue)
      this.mySelectionService.deleteSelection(this.trail.owner, this.trail.uuid);
    else
      this.mySelectionService.addSelection(this.trail.owner, this.trail.uuid);
    this.changeDetector.detectChanges();
  }

}
