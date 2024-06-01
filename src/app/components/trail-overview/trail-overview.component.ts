import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Injector, Input, Output } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { TrackMetadataComponent } from '../track-metadata/track-metadata.component';
import { Track } from 'src/app/model/track';
import { CommonModule } from '@angular/common';
import { TrackService } from 'src/app/services/database/track.service';
import { IonIcon, IonCheckbox, IonButton, IonPopover, IonContent, IonList } from "@ionic/angular/standalone";
import { combineLatest, mergeMap, of } from 'rxjs';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { MenuContentComponent } from '../menu-content/menu-content.component';

class Meta {
  name?: string;
  dateValue?: number;
  dateString?: string;
}

@Component({
  selector: 'app-trail-overview',
  templateUrl: './trail-overview.component.html',
  styleUrls: ['./trail-overview.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [IonList, IonContent, IonPopover, IonButton, IonCheckbox, IonIcon,
    CommonModule,
    TrackMetadataComponent,
    MenuContentComponent,
  ]
})
export class TrailOverviewComponent extends AbstractComponent {

  @Input() trail?: Trail;

  @Input() selectable = false;
  @Input() selected = false;
  @Output() selectedChange = new EventEmitter<boolean>();

  id = IdGenerator.generateId();
  meta: Meta = new Meta();
  track?: Track;

  constructor(
    injector: Injector,
    private trackService: TrackService,
    private i18n: I18nService,
    private changeDetector: ChangeDetectorRef,
    public trailService: TrailService,
  ) {
    super(injector);
  }

  protected override getComponentState() {
    return {
      trail: this.trail
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
          this.trail.currentTrackUuid$.pipe(
            mergeMap(uuid => this.trackService.getTrack$(uuid, owner)),
            mergeMap(track => track ?
              combineLatest([of(track), track.metadata.startDate$])
              : of([undefined, undefined])
            )
          )
        ]),
        ([i18nState, trailName, [track, startDate]]) => {
          const force = i18nState !== previousI18nState;
          let changed = force;
          previousI18nState = i18nState;
          if (track != this.track) {
            this.track = track;
            changed = true;
          }
          if (this.updateMeta(this.meta, 'name', trailName, undefined, force)) changed = true;
          if (this.updateMeta(this.meta, 'date', startDate, timestamp => this.i18n.timestampToDateTimeString(timestamp), force)) changed = true;
          if (changed) this.changeDetector.markForCheck();
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
  }

  setSelected(selected: boolean) {
    if (selected === this.selected) return;
    this.selected = selected;
    this.selectedChange.emit(selected);
  }

}
