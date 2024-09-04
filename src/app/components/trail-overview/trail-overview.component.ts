import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Injector, Input, Output, SimpleChanges } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { TrackMetadataComponent } from '../track-metadata/track-metadata.component';
import { Track } from 'src/app/model/track';
import { CommonModule } from '@angular/common';
import { TrackService } from 'src/app/services/database/track.service';
import { IonIcon, IonCheckbox, IonButton, Platform, IonSpinner, PopoverController } from "@ionic/angular/standalone";
import { BehaviorSubject, combineLatest, debounceTime, of, switchMap } from 'rxjs';
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
  standalone: true,
  imports: [IonSpinner, IonButton, IonCheckbox, IonIcon,
    CommonModule,
    TrackMetadataComponent,
    MenuContentComponent,
  ]
})
export class TrailOverviewComponent extends AbstractComponent {

  @Input() trail?: Trail;
  @Input() refreshMode: 'live' | 'snapshot' = 'snapshot';
  @Input() fromCollection = true;
  @Input() trackSnapshot: TrackMetadataSnapshot | null | undefined;

  @Input() selectable = false;
  @Input() selected = false;
  @Output() selectedChange = new EventEmitter<boolean>();

  id = IdGenerator.generateId();
  meta: Meta = new Meta();
  track$ = new BehaviorSubject<Track | TrackMetadataSnapshot | undefined>(undefined);
  tagsNames: string[] = [];

  constructor(
    injector: Injector,
    private trackService: TrackService,
    private i18n: I18nService,
    private changeDetector: ChangeDetectorRef,
    public trailMenuService: TrailMenuService,
    private tagService: TagService,
    private auth: AuthService,
    private trailService: TrailService,
    private platform: Platform,
    private assets: AssetsService,
    private popoverController: PopoverController,
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

  protected override initComponent(): void {
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.reset();
    if (this.trail) {
      let previousI18nState = 0;
      const owner = this.trail.owner;
      this.byStateAndVisible.subscribe(
        combineLatest([
          this.i18n.stateChanged$,
          this.trail.name$,
          this.trail.location$,
          this.trail.loopType$,
          this.trackSnapshot && this.refreshMode !== 'live' ?
            of([this.trackSnapshot, this.trackSnapshot.startDate] as [TrackMetadataSnapshot, number | undefined]) :
            this.trail.currentTrackUuid$.pipe(
              switchMap(uuid => this.refreshMode === 'live' ? this.trackService.getFullTrack$(uuid, owner) : this.trackService.getMetadata$(uuid, owner)),
              switchMap(track => {
                if (!track) return of([undefined, undefined]);
                if (track instanceof Track) return combineLatest([of(track), track.metadata.startDate$]);
                return of([track, track.startDate] as [TrackMetadataSnapshot, number | undefined]);
              })
            ),
        ]).pipe(debounceTimeExtended(0, 10)),
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
          if (!this._trackMetadataInitialized) this.initTrackMetadata();
        }
      );
      if (owner === this.auth.email) {
        this.byStateAndVisible.subscribe(
          this.tagService.getTrailTagsFullNames$(this.trail.uuid).pipe(debounceTimeExtended(0, 100)),
          tagsNames => {
            if (!Arrays.sameContent(tagsNames, this.tagsNames)) {
              this.tagsNames = tagsNames;
              this.changeDetector.detectChanges();
            }
          }
        );
      }
    }
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
  }

  private _trackMetadataInitialized = false;
  private initTrackMetadata(): void {
    this._trackMetadataInitialized = true;
    const element = document.getElementById('track-metadata-' + this.id);
    TrackMetadataComponent.init(element!, this.track$, of(undefined), false, this.assets, this.i18n, this.whenVisible);
  }

  setSelected(selected: boolean) {
    if (selected === this.selected) return;
    this.selected = selected;
    this.selectedChange.emit(selected);
  }

  openMenu(event: MouseEvent): void {
    const y = event.pageY;
    const h = this.platform.height();
    const remaining = h - y - 15;

    this.popoverController.create({
      component: MenuContentComponent,
      componentProps: {
        menu: this.trailMenuService.getTrailsMenu([this.trail!], false, this.fromCollection ? this.trail!.collectionUuid : undefined)
      },
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

}
