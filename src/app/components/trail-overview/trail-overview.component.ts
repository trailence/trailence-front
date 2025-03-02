import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Injector, Input, Output, SimpleChanges } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { TrackMetadataComponent } from '../track-metadata/track-metadata.component';
import { Track } from 'src/app/model/track';
import { CommonModule } from '@angular/common';
import { TrackService } from 'src/app/services/database/track.service';
import { IonIcon, IonCheckbox, IonButton, IonSpinner, PopoverController, DomController } from "@ionic/angular/standalone";
import { BehaviorSubject, combineLatest, Observable, of, switchMap } from 'rxjs';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MenuContentComponent } from '../menu-content/menu-content.component';
import { TrackMetadataSnapshot } from 'src/app/services/database/track-database';
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

class Meta {
  name?: string;
  dateValue?: number;
  dateString?: string;
  location?: string;
  loopTypeValue?: string;
  loopTypeString?: string;
  loopTypeIconValue?: string;
  loopTypeIconString?: string;
}

@Component({
    selector: 'app-trail-overview',
    templateUrl: './trail-overview.component.html',
    styleUrls: ['./trail-overview.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [IonSpinner, IonButton, IonCheckbox, IonIcon,
        CommonModule,
        PhotosSliderComponent]
})
export class TrailOverviewComponent extends AbstractComponent {

  @Input() trail?: Trail;
  @Input() refreshMode: 'live' | 'snapshot' = 'snapshot';
  @Input() fromCollection = true;
  @Input() trackSnapshot: TrackMetadataSnapshot | null | undefined;

  @Input() selectable = false;
  @Input() selected = false;
  @Output() selectedChange = new EventEmitter<boolean>();

  @Input() photoEnabled = true;
  @Input() hasFixedHeight = false;

  @Input() delayLoading = false;

  id = IdGenerator.generateId();
  meta: Meta = new Meta();
  track$ = new BehaviorSubject<Track | TrackMetadataSnapshot | undefined>(undefined);
  tagsNames: string[] = [];
  photos: Photo[] = [];
  load$ = new BehaviorSubject<boolean>(false);
  observer?: IntersectionObserver;

  external?: TrailInfo;

  constructor(
    injector: Injector,
    private readonly trackService: TrackService,
    private readonly i18n: I18nService,
    private readonly changeDetector: ChangeDetectorRef,
    public trailMenuService: TrailMenuService,
    private readonly tagService: TagService,
    private readonly auth: AuthService,
    private readonly trailService: TrailService,
    private readonly browser: BrowserService,
    private readonly assets: AssetsService,
    private readonly popoverController: PopoverController,
    private readonly domController: DomController,
    private readonly photoService: PhotoService,
    private readonly router: Router,
  ) {
    super(injector);
    this.changeDetector.detach();
  }

  protected override getComponentState() {
    return {
      trail: this.trail,
      trackSnapshot: this.trackSnapshot,
      mode: this.refreshMode,
    }
  }

  protected override onChangesBeforeCheckComponentState(changes: SimpleChanges): void {
    if (changes['selected']) this.changeDetector.detectChanges();
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.reset();
    if (this.trail) {
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
              this.trail!.loopType$,
              this.trackData$(this.trail!, owner),
            ])
          ),
          debounceTimeExtended(0, 10)
        ),
        ([i18nState, trailName, trailLocation, loopType, [track, startDate]]) => {
          const force = i18nState !== previousI18nState;
          let changed = force;
          previousI18nState = i18nState;
          if (track != this.track$.value) {
            this.track$.next(track);
            changed = true;
          }
          if (this.updateMeta(this.meta, 'name', trailName, undefined, force)) changed = true;
          if (this.updateMeta(this.meta, 'location', trailLocation, undefined, force)) changed = true;
          if (this.updateMeta(this.meta, 'date', startDate, timestamp => this.i18n.timestampToDateTimeString(timestamp), force)) changed = true;
          if (this.updateMeta(this.meta, 'loopType', loopType, type => type ? this.i18n.texts.loopType[type] : '', force)) changed = true;
          if (this.updateMeta(this.meta, 'loopTypeIcon', loopType, type => this.trailService.getLoopTypeIcon(type), force)) changed = true;
          if (changed) this.changeDetector.detectChanges();
          if (!this._trackMetadataInitialized && track) this.initTrackMetadata();
        },
        true
      );
      if (owner === this.auth.email) {
        this.byStateAndVisible.subscribe(
          this.load$.pipe(
            filterDefined(),
            switchMap(() => this.tagService.getTrailTagsFullNames$(this.trail!.uuid).pipe(debounceTimeExtended(0, 100)))
          ),
          tagsNames => {
            if (!Arrays.sameContent(tagsNames, this.tagsNames)) {
              this.tagsNames = tagsNames;
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
            switchMap(() => this.photoService.getPhotosForTrail(this.trail!.owner, this.trail!.uuid))
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
        this.byStateAndVisible.subscribe(
          this.load$.pipe(
            filterDefined(),
            switchMap(() => this.injector.get(FetchSourceService).getTrailInfo$(this.trail!.owner, this.trail!.uuid))
          ),
          info => {
            if (this.external === info) return;
            this.external = info ?? undefined;
            this.changeDetector.detectChanges();
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
    if (this.trackSnapshot && this.refreshMode !== 'live')
      return of([this.trackSnapshot, this.trackSnapshot.startDate]);
    return trail.currentTrackUuid$.pipe(
      switchMap(uuid => this.refreshMode === 'live' ? this.trackService.getFullTrack$(uuid, owner) : this.trackService.getMetadata$(uuid, owner)),
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
    TrackMetadataComponent.init(element!.parentElement!, element!, this.track$, of(undefined), false, this.assets, this.i18n, this.whenVisible, this.domController);
  }

  setSelected(selected: boolean) {
    if (selected === this.selected) return;
    this.selected = selected;
    this.selectedChange.emit(selected);
  }

  openMenu(event: MouseEvent): void {
    const y = event.pageY;
    const h = this.browser.height;
    const remaining = h - y - 15;

    this.popoverController.create({
      component: MenuContentComponent,
      componentProps: {
        menu: this.trailMenuService.getTrailsMenu([this.trail!], false, this.fromCollection ? this.trail!.collectionUuid : undefined)
      },
      cssClass: 'tight-menu',
      event: event,
      side: 'right',
      dismissOnSelect: true,
      arrow: true,
    }).then(p => {
      p.style.setProperty('--offset-y', remaining < 300 ? (-300 + remaining) + 'px' : '0px');
      p.style.setProperty('--max-height', remaining < 300 ? '300px' : (h - y - 10) + 'px');
      p.present();
    });
  }

  openPhotos(slider: PhotosSliderComponent): void {
    this.photoService.openSliderPopup(this.photos, slider.index);
  }

  openTrail(): void {
    this.router.navigate(['trail', this.trail!.owner, this.trail!.uuid], {queryParams: { from: this.router.url }});
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

}
