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
    public distanceDiv: HTMLDivElement,
    public durationDiv: HTMLDivElement,
    public estimatedDurationDiv: HTMLDivElement,
    public breaksDurationDiv: HTMLDivElement,
    public positiveElevationDiv: HTMLDivElement,
    public negativeElevationDiv: HTMLDivElement,
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

  meta: Meta;
  meta2: Meta;

  constructor(
    injector: Injector,
    private i18n: I18nService,
    private element: ElementRef,
    private assets: AssetsService,
  ) {
    super(injector);
    const duration = this.createItemElement(element.nativeElement, 'duration', assets);
    const breaksDuration = this.createItemElement(element.nativeElement, 'hourglass', assets);
    const estimatedDuration = this.createItemElement(element.nativeElement, 'chrono', assets);
    const distance = this.createItemElement(element.nativeElement, 'distance', assets);
    const positiveElevation = this.createItemElement(element.nativeElement, 'positive-elevation', assets);
    const negativeElevation = this.createItemElement(element.nativeElement, 'negative-elevation', assets);
    this.meta = new Meta(distance[0], duration[0], estimatedDuration[0], breaksDuration[0], positiveElevation[0], negativeElevation[0], undefined, undefined);
    this.meta2 = new Meta(distance[1], duration[1], estimatedDuration[1], breaksDuration[1], positiveElevation[1], negativeElevation[1], undefined, undefined);
  }

  private createItemElement(parent: HTMLElement, icon: string, assets: AssetsService): [HTMLDivElement, HTMLDivElement] {
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

    const info2 = document.createElement('DIV') as HTMLDivElement;
    info2.className = "metadata-secondary";
    item.appendChild(info2);

    parent.appendChild(container);
    return ([info1, info2]);
  }

  protected override initComponent(): void {
    this.toMeta(this.track$, this.meta);
    this.toMeta(this.track2$, this.meta2);
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
      this.updateMeta(meta, 'duration', duration, v => this.i18n.durationToString(v), state !== previousState);
      this.updateMeta(meta, 'breaksDuration', breaksDuration, v => this.i18n.durationToString(v), state !== previousState);
      this.updateMeta(meta, 'estimatedDuration', estimatedDuration, v => '≈ ' + this.i18n.durationToString(v), state !== previousState);
      if (this.detailed) {
        if (!meta.highestAltitudeDiv) {
          const highestAltitudeDivs = this.createItemElement(this.element.nativeElement, 'highest-point', this.assets);
          const lowestAltitudeDivs = this.createItemElement(this.element.nativeElement, 'lowest-point', this.assets);
          this.meta.highestAltitudeDiv = highestAltitudeDivs[0];
          this.meta2.highestAltitudeDiv = highestAltitudeDivs[1];
          this.meta.lowestAltitudeDiv = lowestAltitudeDivs[0];
          this.meta2.lowestAltitudeDiv = lowestAltitudeDivs[1];
        }
        this.updateMeta(meta, 'highestAltitude', highestAltitude, v => this.i18n.elevationToString(v), state !== previousState);
        this.updateMeta(meta, 'lowestAltitude', lowestAltitude, v => this.i18n.elevationToString(v), state !== previousState);
      }
      previousState = state as number;
    })
  }

  private updateMeta(meta: any, key: string, value: any, toString: (value: any) => string, forceChange: boolean): void {
    if (!forceChange && meta[key  + 'Value'] === value) return;
    meta[key + 'Value'] = value;
    (meta[key + 'Div'] as HTMLDivElement).innerText = value === undefined ? '' : toString(value);
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
