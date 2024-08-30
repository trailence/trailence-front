import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Injector, Input } from '@angular/core';
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

  durationTitle!: HTMLDivElement;
  breaksDurationTitle?: HTMLDivElement;
  estimatedDurationTitle?: HTMLDivElement;
  distanceTitle!: HTMLDivElement;
  positiveElevationTitle!: HTMLDivElement;
  negativeElevationTitle!: HTMLDivElement;
  highestAltitudeTitle?: HTMLDivElement;
  lowestAltitudeTitle?: HTMLDivElement;

  constructor(
    injector: Injector,
    private i18n: I18nService,
    private element: ElementRef,
    private assets: AssetsService,
    changeDetector: ChangeDetectorRef,
  ) {
    super(injector);
    changeDetector.detach();
  }

  protected override initComponent(): void {
    const duration = this.createItemElement(this.element.nativeElement, 'duration', this.assets);
    const breaksDuration = this.detailed ? this.createItemElement(this.element.nativeElement, 'hourglass', this.assets) : [undefined, undefined, undefined];
    const estimatedDuration = this.detailed ? this.createItemElement(this.element.nativeElement, 'chrono', this.assets) : [undefined, undefined, undefined];
    const distance = this.createItemElement(this.element.nativeElement, 'distance', this.assets);
    const positiveElevation = this.createItemElement(this.element.nativeElement, 'positive-elevation', this.assets);
    const negativeElevation = this.createItemElement(this.element.nativeElement, 'negative-elevation', this.assets);
    const highestAltitudeDivs = this.detailed ? this.createItemElement(this.element.nativeElement, 'highest-point', this.assets) : [undefined, undefined, undefined];
    const lowestAltitudeDivs = this.detailed ? this.createItemElement(this.element.nativeElement, 'lowest-point', this.assets) : [undefined, undefined, undefined];
    this.durationTitle = duration[2];
    this.breaksDurationTitle = breaksDuration[2];
    this.estimatedDurationTitle = estimatedDuration[2];
    this.distanceTitle = distance[2];
    this.positiveElevationTitle = positiveElevation[2];
    this.negativeElevationTitle = negativeElevation[2];
    this.highestAltitudeTitle = highestAltitudeDivs[2];
    this.lowestAltitudeTitle = lowestAltitudeDivs[2];
    this.meta = new Meta(distance[0], duration[0], estimatedDuration[0], breaksDuration[0], positiveElevation[0], negativeElevation[0], highestAltitudeDivs[0], lowestAltitudeDivs[0]);
    this.meta2 = new Meta(distance[1], duration[1], estimatedDuration[1], breaksDuration[1], positiveElevation[1], negativeElevation[1], highestAltitudeDivs[1], lowestAltitudeDivs[1]);
    this.toMeta(this.track$, this.meta);
    this.toMeta(this.track2$, this.meta2);
  }

  private createItemElement(parent: HTMLElement, icon: string, assets: AssetsService): [HTMLDivElement, HTMLDivElement | undefined, HTMLDivElement] {
    const container = document.createElement('DIV');
    container.className = 'metadata-item-container';

    const item = document.createElement('DIV');
    item.className = 'metadata-item';
    container.appendChild(item);

    const iconContainer = document.createElement('DIV');
    iconContainer.className = 'icon';
    item.appendChild(iconContainer);
    assets.loadSvg(assets.icons[icon]).subscribe(svg => {
      iconContainer.parentElement?.insertBefore(svg, iconContainer);
      iconContainer.parentElement?.removeChild(iconContainer);
    })

    const content = document.createElement('DIV');
    content.className = 'metadata-content';
    item.appendChild(content);

    const title = document.createElement('DIV') as HTMLDivElement;
    title.className = 'metadata-title';
    content.appendChild(title);

    const value = document.createElement('DIV');
    value.className = 'metadata-value';
    content.appendChild(value);

    const info1 = document.createElement('DIV') as HTMLDivElement;
    info1.className = "metadata-primary";
    value.appendChild(info1);

    let info2: HTMLDivElement | undefined = undefined;
    if (this.detailed) {
      info2 = document.createElement('DIV') as HTMLDivElement;
      info2.className = "metadata-secondary";
      value.appendChild(info2);
    }

    parent.appendChild(container);
    return ([info1, info2, title]);
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
      debounceTime(1),
    ), ([distance, duration, positiveElevation, negativeElevation, highestAltitude, lowestAltitude, breaksDuration, estimatedDuration, state]) => {
      const force = state !== previousState;
      let changed = force;
      if (this.updateMeta(meta, 'distance', distance, v => this.i18n.distanceToString(v), force)) changed = true;
      if (this.updateMeta(meta, 'positiveElevation', positiveElevation, v => '+ ' + this.i18n.elevationToString(v), force)) changed = true;
      if (this.updateMeta(meta, 'negativeElevation', negativeElevation, v => '- ' + this.i18n.elevationToString(v), force)) changed = true;
      if (duration !== undefined && breaksDuration !== undefined) duration -= breaksDuration;
      if (this.detailed) {
        if (this.updateMeta(meta, 'highestAltitude', highestAltitude, v => this.i18n.elevationToString(v), force)) changed = true;
        if (this.updateMeta(meta, 'lowestAltitude', lowestAltitude, v => this.i18n.elevationToString(v), force)) changed = true;
        if (this.updateMeta(meta, 'duration', duration, v => this.i18n.durationToString(v), force)) changed = true;
        if (this.updateMeta(meta, 'breaksDuration', breaksDuration, v => this.i18n.durationToString(v), force)) changed = true;
        if (this.updateMeta(meta, 'estimatedDuration', estimatedDuration, v => '≈ ' + this.i18n.durationToString(v), force)) changed = true;
      } else {
        let d = this.i18n.durationToString(duration);
        if (estimatedDuration !== undefined) d += ' (≈ ' + this.i18n.durationToString(estimatedDuration) + ')';
        if (this.updateMeta(meta, 'duration', d, v => v, force)) changed = true;
      }
      if (force) {
        this.durationTitle.innerText = this.i18n.texts.metadata.duration;
        this.distanceTitle.innerText = this.i18n.texts.metadata.distance;
        this.positiveElevationTitle.innerText = this.i18n.texts.metadata.positiveElevation;
        this.negativeElevationTitle.innerText = this.i18n.texts.metadata.negativeElevation;
        if (this.detailed) {
          this.breaksDurationTitle!.innerText = this.i18n.texts.metadata.breaksDuration;
          this.estimatedDurationTitle!.innerText = this.i18n.texts.metadata.estimatedDuration;
          this.highestAltitudeTitle!.innerText = this.i18n.texts.metadata.highestAltitude;
          this.lowestAltitudeTitle!.innerText = this.i18n.texts.metadata.lowestAltitude;
        }
      }
      previousState = state as number;
      //if (changed) this.changeDetector.detectChanges();
    })
  }

  private updateMeta(meta: any, key: string, value: any, toString: (value: any) => string, forceChange: boolean): boolean {
    if (!forceChange && meta[key  + 'Value'] === value) return false;
    meta[key + 'Value'] = value;
    const div = (meta[key + 'Div'] as HTMLDivElement);
    if (div)
      div.innerText = value === undefined ? '' : toString(value);
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
    if (newState?.track2 !== previousState?.track2) this.track2$.next(newState.track2);
  }

}
