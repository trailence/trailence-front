import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, Input, OnInit } from '@angular/core';
import { Track } from 'src/app/model/track';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { IonGrid, IonCol, IonIcon } from '@ionic/angular/standalone';
import { BehaviorSubject, Observable, combineLatest, mergeMap, of } from 'rxjs';
import { CommonModule } from '@angular/common';
import { I18nService } from 'src/app/services/i18n/i18n.service';

export type TrackMetadataDisplayMode = 'SINGLE_COLUMN' | 'TWO_COLUMNS' | 'TILES';

class Meta {
  distanceValue = 0;
  distanceString = '';
  durationValue = 0;
  durationString = '';
  positiveElevationValue = 0;
  positiveElevationString = '';
  negativeElevationValue = 0;
  negativeElevationString = '';
}

@Component({
  selector: 'app-track-metadata',
  templateUrl: './track-metadata.component.html',
  styleUrls: ['./track-metadata.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonGrid, IonCol,
    IonIcon,
  ]
})
export class TrackMetadataComponent extends AbstractComponent {

  @Input()
  track?: Track;

  @Input()
  track2?: Track;

  @Input()
  mode: TrackMetadataDisplayMode = 'TWO_COLUMNS';

  private track$ = new BehaviorSubject<Track | undefined>(undefined);
  private track2$ = new BehaviorSubject<Track | undefined>(undefined);

  meta = new Meta();
  meta2 = new Meta();

  constructor(
    injector: Injector,
    private changeDetector: ChangeDetectorRef,
    private i18n: I18nService,
  ) {
    super(injector);
  }

  protected override initComponent(): void {
    this.toMeta(this.track$, this.meta);
    this.toMeta(this.track2$, this.meta2);
  }

  private toMeta(track$: Observable<Track | undefined>, meta: Meta): void {
    let previousState = 0;
    this.whenVisible.subscribe(track$.pipe(
      mergeMap(track => !track ? of([0, 0, 0, 0, 0]) :
        combineLatest([
          track.metadata.distance$,
          track.metadata.duration$,
          track.metadata.positiveElevation$,
          track.metadata.negativeElevation$,
          this.i18n.stateChanged$
        ])
      )
    ), ([distance, duration, positiveElevation, negativeElevation, state]) => {
      let changed = false;
      if (this.updateMeta(meta, 'distance', distance, v => this.i18n.distanceToString(v), state !== previousState)) changed = true;
      if (this.updateMeta(meta, 'duration', duration, v => this.i18n.durationToString(v), state !== previousState)) changed = true;
      if (this.updateMeta(meta, 'positiveElevation', positiveElevation, v => this.i18n.elevationToString(v), state !== previousState)) changed = true;
      if (this.updateMeta(meta, 'negativeElevation', negativeElevation, v => this.i18n.elevationToString(v), state !== previousState)) changed = true;
      previousState = state;
      if (changed) this.changeDetector.markForCheck();
    })
  }

  private updateMeta(meta: any, key: string, value: any, toString: (value: any) => string, forceChange: boolean): boolean {
    if (!forceChange && meta[key  + 'Value'] === value) return false;
    meta[key + 'Value'] = value;
    meta[key + 'String'] = toString(value);
    return true;
  }

  protected override getComponentState(): any {
    return {
      track: this.track,
      track2: this.track2,
    }
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    if (newState?.track !== previousState?.track) this.track$.next(newState.track);
    if (newState?.track !== previousState?.track) this.track2$.next(newState.track2);
  }

}
