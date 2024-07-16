import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Injector, Input, Output } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { TrackMetadataComponent } from '../track-metadata/track-metadata.component';
import { Track } from 'src/app/model/track';
import { CommonModule } from '@angular/common';
import { TrackService } from 'src/app/services/database/track.service';
import { IonIcon, IonCheckbox, IonButton, IonPopover, IonContent } from "@ionic/angular/standalone";
import { combineLatest, of, switchMap } from 'rxjs';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { MenuContentComponent } from '../menu-content/menu-content.component';
import { TrackMetadataSnapshot } from 'src/app/services/database/track-database';
import { TagService } from 'src/app/services/database/tag.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';

class Meta {
  name?: string;
  dateValue?: number;
  dateString?: string;
  location?: string;
}

@Component({
  selector: 'app-trail-overview',
  templateUrl: './trail-overview.component.html',
  styleUrls: ['./trail-overview.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [IonContent, IonPopover, IonButton, IonCheckbox, IonIcon,
    CommonModule,
    TrackMetadataComponent,
    MenuContentComponent,
  ]
})
export class TrailOverviewComponent extends AbstractComponent {

  @Input() trail?: Trail;
  @Input() refreshMode: 'live' | 'snapshot' = 'snapshot';

  @Input() selectable = false;
  @Input() selected = false;
  @Output() selectedChange = new EventEmitter<boolean>();

  id = IdGenerator.generateId();
  meta: Meta = new Meta();
  track?: Track | TrackMetadataSnapshot;
  tagsNames: string[] = [];

  constructor(
    injector: Injector,
    private trackService: TrackService,
    private i18n: I18nService,
    private changeDetector: ChangeDetectorRef,
    public trailService: TrailService,
    private tagService: TagService,
    private auth: AuthService,
  ) {
    super(injector);
  }

  protected override getComponentState() {
    return {
      trail: this.trail,
      mode: this.refreshMode,
    }
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
          this.trail.currentTrackUuid$.pipe(
            switchMap(uuid => this.refreshMode === 'live' ? this.trackService.getFullTrack$(uuid, owner) : this.trackService.getMetadata$(uuid, owner)),
            switchMap(track => {
              if (!track) return of([undefined, undefined]);
              if (track instanceof Track) return combineLatest([of(track), track.metadata.startDate$]);
              return of([track, track.startDate] as [TrackMetadataSnapshot, number | undefined]);
            })
          )
        ]),
        ([i18nState, trailName, trailLocation, [track, startDate]]) => {
          const force = i18nState !== previousI18nState;
          let changed = force;
          previousI18nState = i18nState;
          if (track != this.track) {
            this.track = track;
            changed = true;
          }
          if (this.updateMeta(this.meta, 'name', trailName, undefined, force)) changed = true;
          if (this.updateMeta(this.meta, 'location', trailLocation, undefined, force)) changed = true;
          if (this.updateMeta(this.meta, 'date', startDate, timestamp => this.i18n.timestampToDateTimeString(timestamp), force)) changed = true;
          if (changed) this.changeDetector.markForCheck();
        }
      );
      if (owner === this.auth.email)
        this.byStateAndVisible.subscribe(
          this.tagService.getTrailTagsNames$(this.trail.uuid).pipe(debounceTimeExtended(0, 100)),
          names => {
            this.tagsNames = names;
            this.changeDetector.markForCheck();
          }
        );
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
    this.track = undefined;
    this.tagsNames = [];
  }

  setSelected(selected: boolean) {
    if (selected === this.selected) return;
    this.selected = selected;
    this.selectedChange.emit(selected);
  }

}
