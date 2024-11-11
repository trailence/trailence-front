import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Injector, Input } from '@angular/core';
import { Track } from 'src/app/model/track';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { DomController } from '@ionic/angular/standalone';
import { BehaviorSubject, Observable, combineLatest, map, of, switchMap } from 'rxjs';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrackMetadataSnapshot } from 'src/app/services/database/track-database';
import { AssetsService } from 'src/app/services/assets/assets.service';
import { Resubscribeables } from 'src/app/utils/rxjs/subscription-utils';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';

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

class Titles {
  constructor(
    public durationTitle: HTMLDivElement,
    public breaksDurationTitle: HTMLDivElement | undefined,
    public estimatedDurationTitle: HTMLDivElement | undefined,
    public distanceTitle: HTMLDivElement,
    public positiveElevationTitle: HTMLDivElement,
    public negativeElevationTitle: HTMLDivElement,
    public highestAltitudeTitle: HTMLDivElement | undefined,
    public lowestAltitudeTitle: HTMLDivElement | undefined,
  ) {}
}

@Component({
  selector: 'app-track-metadata',
  templateUrl: './track-metadata.component.html',
  styleUrls: ['./track-metadata.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: []
})
export class TrackMetadataComponent extends AbstractComponent {

  @Input() track?: Track | TrackMetadataSnapshot;
  @Input() track2?: Track | TrackMetadataSnapshot;
  @Input() detailed = false;

  private readonly track$ = new BehaviorSubject<Track | TrackMetadataSnapshot | undefined>(undefined);
  private readonly track2$ = new BehaviorSubject<Track | TrackMetadataSnapshot | undefined>(undefined);

  constructor(
    injector: Injector,
    private readonly i18n: I18nService,
    private readonly element: ElementRef,
    private readonly assets: AssetsService,
    changeDetector: ChangeDetectorRef,
    private readonly domController: DomController,
  ) {
    super(injector);
    changeDetector.detach();
  }

  protected override initComponent(): void {
    TrackMetadataComponent.init(this.element.nativeElement, this.track$, this.track2$, this.detailed, this.assets, this.i18n, this.whenVisible, this.domController);
  }

  public static init( // NOSONAR
    container: HTMLElement,
    track$: Observable<Track | TrackMetadataSnapshot | undefined>,
    track2$: Observable<Track | TrackMetadataSnapshot | undefined>,
    detailed: boolean,
    assets: AssetsService,
    i18n: I18nService,
    whenVisible: Resubscribeables,
    domController: DomController,
  ): void {
    domController.write(() => {
      whenVisible.zone.runOutsideAngular(() => {
        const duration = TrackMetadataComponent.createItemElement(container, 'duration', assets, detailed);
        const breaksDuration = detailed ? TrackMetadataComponent.createItemElement(container, 'hourglass', assets, detailed) : [undefined, undefined, undefined];
        const estimatedDuration = detailed ? TrackMetadataComponent.createItemElement(container, 'chrono', assets, detailed) : [undefined, undefined, undefined];
        const distance = TrackMetadataComponent.createItemElement(container, 'distance', assets, detailed);
        const positiveElevation = TrackMetadataComponent.createItemElement(container, 'positive-elevation', assets, detailed);
        const negativeElevation = TrackMetadataComponent.createItemElement(container, 'negative-elevation', assets, detailed);
        const highestAltitudeDivs = detailed ? TrackMetadataComponent.createItemElement(container, 'highest-point', assets, detailed) : [undefined, undefined, undefined];
        const lowestAltitudeDivs = detailed ? TrackMetadataComponent.createItemElement(container, 'lowest-point', assets, detailed) : [undefined, undefined, undefined];
        const titles = new Titles(
          duration[2],
          breaksDuration[2],
          estimatedDuration[2],
          distance[2],
          positiveElevation[2],
          negativeElevation[2],
          highestAltitudeDivs[2],
          lowestAltitudeDivs[2]
        );
        const meta = new Meta(distance[0], duration[0], estimatedDuration[0], breaksDuration[0], positiveElevation[0], negativeElevation[0], highestAltitudeDivs[0], lowestAltitudeDivs[0]);
        TrackMetadataComponent.toMeta(track$, meta, detailed, whenVisible, i18n, titles, domController);
        if (detailed) {
          const meta2 = new Meta(distance[1], duration[1], estimatedDuration[1], breaksDuration[1], positiveElevation[1], negativeElevation[1], highestAltitudeDivs[1], lowestAltitudeDivs[1]);
          TrackMetadataComponent.toMeta(track2$, meta2, detailed, whenVisible, i18n, titles, domController);
        }
      });
    });
  }

  private static createItemElement(parent: HTMLElement, icon: string, assets: AssetsService, detailed: boolean): [HTMLDivElement, HTMLDivElement | undefined, HTMLDivElement] {
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
    if (detailed) {
      info2 = document.createElement('DIV') as HTMLDivElement;
      info2.className = "metadata-secondary";
      value.appendChild(info2);
    }

    parent.appendChild(container);
    return ([info1, info2, title]);
  }

  private static toMeta(track$: Observable<Track | TrackMetadataSnapshot | undefined>, meta: Meta, detailed: boolean, whenVisible: Resubscribeables, i18n: I18nService, titles: Titles, domController: DomController): void {
    let previousState = 0;
    whenVisible.subscribe(track$.pipe(
      switchMap(track => {
        if (!track) return of([undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 0]);
        if (track instanceof Track) return combineLatest([
          track.metadata.distance$,
          track.metadata.duration$,
          track.metadata.positiveElevation$,
          track.metadata.negativeElevation$,
          detailed ? track.metadata.highestAltitude$ : of(undefined),
          detailed ? track.metadata.lowestAltitude$ : of(undefined),
          track.computedMetadata.breaksDuration$,
          track.computedMetadata.estimatedDuration$,
          i18n.stateChanged$
        ]);
        return i18n.stateChanged$.pipe(map(state => ([
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
      debounceTimeExtended(0, 10),
    ), ([distance, duration, positiveElevation, negativeElevation, highestAltitude, lowestAltitude, breaksDuration, estimatedDuration, state]) => {
      const force = state !== previousState;
      TrackMetadataComponent.updateMeta(meta, 'distance', distance, v => i18n.distanceToString(v), force, domController);
      TrackMetadataComponent.updateMeta(meta, 'positiveElevation', positiveElevation, v => '+ ' + i18n.elevationToString(v), force, domController);
      TrackMetadataComponent.updateMeta(meta, 'negativeElevation', negativeElevation, v => '- ' + i18n.elevationToString(v), force, domController);
      if (!detailed) {
        TrackMetadataComponent.shown(meta.positiveElevationDiv, meta.positiveElevationValue !== undefined && meta.negativeElevationValue !== undefined);
        TrackMetadataComponent.shown(meta.negativeElevationDiv, meta.positiveElevationValue !== undefined && meta.negativeElevationValue !== undefined);
      }
      if (duration !== undefined && breaksDuration !== undefined) duration -= breaksDuration;
      if (detailed) {
        TrackMetadataComponent.updateMeta(meta, 'highestAltitude', highestAltitude, v => i18n.elevationToString(v), force, domController);
        TrackMetadataComponent.updateMeta(meta, 'lowestAltitude', lowestAltitude, v => i18n.elevationToString(v), force, domController);
        TrackMetadataComponent.updateMeta(meta, 'duration', duration, v => i18n.durationToString(v), force, domController);
        TrackMetadataComponent.updateMeta(meta, 'breaksDuration', breaksDuration, v => i18n.durationToString(v), force, domController);
        TrackMetadataComponent.updateMeta(meta, 'estimatedDuration', estimatedDuration, v => '≈ ' + i18n.durationToString(v), force, domController);
      } else {
        let d = i18n.durationToString(duration);
        if (estimatedDuration !== undefined) d += ' (≈ ' + i18n.durationToString(estimatedDuration) + ')';
        TrackMetadataComponent.updateMeta(meta, 'duration', d, v => v, force, domController);
      }
      if (force) {
        titles.durationTitle.innerText = i18n.texts.metadata.duration;
        titles.distanceTitle.innerText = i18n.texts.metadata.distance;
        titles.positiveElevationTitle.innerText = i18n.texts.metadata.positiveElevation;
        titles.negativeElevationTitle.innerText = i18n.texts.metadata.negativeElevation;
        if (detailed) {
          titles.breaksDurationTitle!.innerText = i18n.texts.metadata.breaksDuration;
          titles.estimatedDurationTitle!.innerText = i18n.texts.metadata.estimatedDuration;
          titles.highestAltitudeTitle!.innerText = i18n.texts.metadata.highestAltitude;
          titles.lowestAltitudeTitle!.innerText = i18n.texts.metadata.lowestAltitude;
        }
      }
      previousState = state as number;
      //if (changed) this.changeDetector.detectChanges();
    }, true);
  }

  private static updateMeta(meta: any, key: string, value: any, toString: (value: any) => string, forceChange: boolean, domController: DomController): boolean {
    if (!forceChange && meta[key  + 'Value'] === value) return false;
    meta[key + 'Value'] = value;
    const div = (meta[key + 'Div'] as HTMLDivElement);
    if (div) domController.write(() => div.innerText = value === undefined ? '' : toString(value));
    return true;
  }

  private static shown(div: HTMLDivElement | undefined, shown: boolean): void {
    const container = div?.parentElement?.parentElement?.parentElement?.parentElement;
    if (container) container.style.display = shown ? '' : 'none';
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
