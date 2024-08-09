import { ChangeDetectionStrategy, Component, ElementRef, Injector, Input } from '@angular/core';
import { Track } from 'src/app/model/track';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { IonIcon } from '@ionic/angular/standalone';
import { BehaviorSubject, Observable, combineLatest, debounceTime, map, of, switchMap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrackMetadataSnapshot } from 'src/app/services/database/track-database';
import { AssetsService } from 'src/app/services/assets/assets.service';

class Meta {
  distanceValue?: number = undefined;
  durationValue?: number = undefined;
  estimatedDuration?: number = undefined;
  breaksDuration?: number = undefined;
  positiveElevationValue?: number = undefined;
  negativeElevationValue?: number = undefined;
  highestAltitudeValue?: number = undefined;
  lowestAltitudeValue?: number = undefined;

  constructor(
    public distanceDiv: HTMLDivElement | undefined,
    public durationDiv: HTMLDivElement | undefined,
    public estimatedDurationDiv: HTMLDivElement | undefined,
    public breaksDurationDiv: HTMLDivElement | undefined,
    public positiveElevationDiv: HTMLDivElement | undefined,
    public negativeElevationDiv: HTMLDivElement | undefined,
    public highestAltitudeDiv: HTMLDivElement | undefined,
    public lowestAltitudeDiv: HTMLDivElement | undefined,
  ) {}
}

@Component({
  selector: 'app-track-metadata',
  templateUrl: './track-metadata.component.html',
  styleUrls: ['./track-metadata.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonIcon,
  ]
})
export class TrackMetadataComponent extends AbstractComponent {

  @Input() track?: Track | TrackMetadataSnapshot;
  @Input() track2?: Track | TrackMetadataSnapshot;
  @Input() detailed = false;

  private track$ = new BehaviorSubject<Track | TrackMetadataSnapshot | undefined>(undefined);
  private track2$ = new BehaviorSubject<Track | TrackMetadataSnapshot | undefined>(undefined);

  meta!: Meta;
  meta2!: Meta;

  constructor(
    injector: Injector,
    private i18n: I18nService,
    private element: ElementRef,
    private assets: AssetsService,
  ) {
    super(injector);
  }

  protected override initComponent(): void {
    const duration = this.createItemElement(this.element.nativeElement, 'duration', this.assets);
    const breaksDuration = this.detailed ? this.createItemElement(this.element.nativeElement, 'hourglass', this.assets) : [undefined, undefined];
    const estimatedDuration = this.detailed ? this.createItemElement(this.element.nativeElement, 'chrono', this.assets) : [undefined, undefined];
    const distance = this.createItemElement(this.element.nativeElement, 'distance', this.assets);
    const positiveElevation = this.createItemElement(this.element.nativeElement, 'positive-elevation', this.assets);
    const negativeElevation = this.createItemElement(this.element.nativeElement, 'negative-elevation', this.assets);
    const highestAltitudeDivs = this.detailed ? this.createItemElement(this.element.nativeElement, 'highest-point', this.assets) : [undefined, undefined];
    const lowestAltitudeDivs = this.detailed ? this.createItemElement(this.element.nativeElement, 'lowest-point', this.assets) : [undefined, undefined];
    this.meta = new Meta(distance[0], duration[0], estimatedDuration[0], breaksDuration[0], positiveElevation[0], negativeElevation[0], highestAltitudeDivs[0], lowestAltitudeDivs[0]);
    this.meta2 = new Meta(distance[1], duration[1], estimatedDuration[1], breaksDuration[1], positiveElevation[1], negativeElevation[1], highestAltitudeDivs[1], lowestAltitudeDivs[1]);
    this.toMeta(this.track$, this.meta);
    this.toMeta(this.track2$, this.meta2);
  }

  private createItemElement(parent: HTMLElement, icon: string, assets: AssetsService): [HTMLDivElement, HTMLDivElement | undefined] {
    const container = document.createElement('DIV');
    container.className = 'metadata-item-container';

    const item = document.createElement('DIV');
    item.className = 'metadata-item';
    container.appendChild(item);

    const iconContainer = document.createElement('DIV');
    iconContainer.className = 'icon';
    item.appendChild(iconContainer);
    assets.loadText(assets.icons[icon], true).subscribe(svg => {
      iconContainer.parentElement?.insertBefore(svg.cloneNode(true), iconContainer);
      iconContainer.parentElement?.removeChild(iconContainer);
    })

    const info1 = document.createElement('DIV') as HTMLDivElement;
    info1.className = "metadata-primary";
    item.appendChild(info1);

    let info2: HTMLDivElement | undefined = undefined;
    if (this.detailed) {
      info2 = document.createElement('DIV') as HTMLDivElement;
      info2.className = "metadata-secondary";
      item.appendChild(info2);
    }

    parent.appendChild(container);
    return ([info1, info2]);
  }

  private toMeta(track$: Observable<Track | TrackMetadataSnapshot | undefined>, meta: Meta): void {
    let previousState = 0;
    this.whenVisible.subscribe(track$.pipe(
      switchMap(track => {
        if (!track) return of([undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 0]);
        if (track instanceof Track) return combineLatest([
          track.metadata.distance$,
          track.metadata.duration$,
          track.metadata.positiveElevation$,
          track.metadata.negativeElevation$,
          this.detailed ? track.metadata.highestAltitude$ : of(undefined),
          this.detailed ? track.metadata.lowestAltitude$ : of(undefined),
          track.computedMetadata.breaksDuration$,
          track.computedMetadata.estimatedDuration$,
          this.i18n.stateChanged$
        ]);
        return this.i18n.stateChanged$.pipe(map(state => ([
          track.distance,
          track.duration,
          track.positiveElevation,
          track.negativeElevation,
          track.highestAltitude,
          track.lowestAltitude,
          track.breaksDuration,
          track.estimatedDuration,
          state
        ])));
      }),
      debounceTime(100),
    ), ([distance, duration, positiveElevation, negativeElevation, highestAltitude, lowestAltitude, breaksDuration, estimatedDuration, state]) => {
      this.updateMeta(meta, 'distance', distance, v => this.i18n.distanceToString(v), state !== previousState);
      this.updateMeta(meta, 'positiveElevation', positiveElevation, v => '+ ' + this.i18n.elevationToString(v), state !== previousState);
      this.updateMeta(meta, 'negativeElevation', negativeElevation, v => '- ' + this.i18n.elevationToString(v), state !== previousState);
      if (duration !== undefined && breaksDuration !== undefined) duration -= breaksDuration;
      if (this.detailed) {
        this.updateMeta(meta, 'highestAltitude', highestAltitude, v => this.i18n.elevationToString(v), state !== previousState);
        this.updateMeta(meta, 'lowestAltitude', lowestAltitude, v => this.i18n.elevationToString(v), state !== previousState);
        this.updateMeta(meta, 'duration', duration, v => this.i18n.durationToString(v), state !== previousState);
        this.updateMeta(meta, 'breaksDuration', breaksDuration, v => this.i18n.durationToString(v), state !== previousState);
        this.updateMeta(meta, 'estimatedDuration', estimatedDuration, v => '≈ ' + this.i18n.durationToString(v), state !== previousState);
      } else {
        let d = this.i18n.durationToString(duration);
        if (estimatedDuration !== undefined) d += ' (≈ ' + this.i18n.durationToString(estimatedDuration) + ')';
        this.updateMeta(meta, 'duration', d, v => v, state !== previousState);
      }
      previousState = state as number;
    })
  }

  private updateMeta(meta: any, key: string, value: any, toString: (value: any) => string, forceChange: boolean): void {
    if (!forceChange && meta[key  + 'Value'] === value) return;
    meta[key + 'Value'] = value;
    const div = (meta[key + 'Div'] as HTMLDivElement);
    if (div)
      div.innerText = value === undefined ? '' : toString(value);
  }

  protected override getComponentState(): any {
    return {
      track: this.track,
      track2: this.track2,
    }
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    if (newState?.track !== previousState?.track) this.track$.next(newState.track);
    if (newState?.track2 !== previousState?.track2) this.track2$.next(newState.track2);
  }

}
