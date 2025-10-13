import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Injector, Input } from '@angular/core';
import { Track } from 'src/app/model/track';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { DomController } from '@ionic/angular/standalone';
import { BehaviorSubject, Observable, combineLatest, map, of, switchMap } from 'rxjs';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { AssetsService } from 'src/app/services/assets/assets.service';
import { Resubscribeables } from 'src/app/utils/rxjs/subscription-utils';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { TrackMetadataSnapshot } from 'src/app/model/snapshots';
import { addTooltip } from '../tooltip/tooltip.directive';
import { TranslatedString } from 'src/app/services/i18n/i18n-string';
import { ComputedPreferences } from 'src/app/services/preferences/preferences';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';

class Meta {
  distanceValue?: number = undefined;
  durationValue?: number = undefined;
  estimatedDurationValue?: number = undefined;
  breaksDurationValue?: number = undefined;
  speedValue?: number = undefined;
  positiveElevationValue?: number = undefined;
  negativeElevationValue?: number = undefined;
  highestAltitudeValue?: number = undefined;
  lowestAltitudeValue?: number = undefined;

  constructor(
    public distanceDiv: HTMLDivElement | undefined,
    public durationDiv: HTMLDivElement | undefined,
    public estimatedDurationDiv: HTMLDivElement | undefined,
    public breaksDurationDiv: HTMLDivElement | undefined,
    public speedDiv: HTMLDivElement | undefined,
    public emptyDiv: HTMLDivElement | undefined,
    public positiveElevationDiv: HTMLDivElement | undefined,
    public negativeElevationDiv: HTMLDivElement | undefined,
    public highestAltitudeDiv: HTMLDivElement | undefined,
    public lowestAltitudeDiv: HTMLDivElement | undefined,
  ) {}
}

class Titles {
  constructor(
    public durationTitle: HTMLElement,
    public breaksDurationTitle: HTMLElement | undefined,
    public estimatedDurationTitle: HTMLElement | undefined,
    public distanceTitle: HTMLElement,
    public speedTitle: HTMLElement | undefined,
    public positiveElevationTitle: HTMLElement,
    public negativeElevationTitle: HTMLElement,
    public highestAltitudeTitle: HTMLElement | undefined,
    public lowestAltitudeTitle: HTMLElement | undefined,
  ) {}
}

type TrackType = Track | TrackMetadataSnapshot | undefined;

export interface TrackMetadataConfig {
  mergeDurationAndEstimated: boolean;
  showBreaksDuration: boolean;
  showHighestAndLowestAltitude: boolean;
  allowSmallOnOneLine: boolean;
  mayHave2Values: boolean;
  alwaysShowElevation: boolean;
  showSpeed: boolean;
}

@Component({
    selector: 'app-track-metadata',
    templateUrl: './track-metadata.component.html',
    styleUrls: ['./track-metadata.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: []
})
export class TrackMetadataComponent extends AbstractComponent {

  @Input() track?: Track | TrackMetadataSnapshot;
  @Input() track2?: Track | TrackMetadataSnapshot;
  @Input() config?: TrackMetadataConfig;

  private readonly track$ = new BehaviorSubject<TrackType>(undefined);
  private readonly track2$ = new BehaviorSubject<TrackType>(undefined);

  constructor(
    injector: Injector,
    private readonly i18n: I18nService,
    private readonly element: ElementRef,
    private readonly assets: AssetsService,
    changeDetector: ChangeDetectorRef,
    private readonly domController: DomController,
    private readonly preferences: PreferencesService,
  ) {
    super(injector);
    changeDetector.detach();
  }

  protected override initComponent(): void {
    TrackMetadataComponent.init(this.element.nativeElement, undefined, this.track$, this.track2$, this.config!, this.assets, this.i18n, this.whenVisible, this.domController, this.preferences.preferences);
  }

  public static init( // NOSONAR
    container: HTMLElement,
    insertBefore: HTMLElement | undefined,
    track$: Observable<TrackType>,
    track2$: Observable<TrackType>,
    config: TrackMetadataConfig,
    assets: AssetsService,
    i18n: I18nService,
    whenVisible: Resubscribeables,
    domController: DomController,
    preferences: ComputedPreferences,
  ): void {
    domController.write(() => {
      whenVisible.zone.runOutsideAngular(() => {
        if (insertBefore) {
          while (insertBefore.previousElementSibling) insertBefore.parentElement!.removeChild(insertBefore.previousElementSibling);
        }
        const duration = TrackMetadataComponent.createItemElement(container, insertBefore, 'duration', assets, config.mayHave2Values, false);
        const breaksDuration = config.showBreaksDuration ? TrackMetadataComponent.createItemElement(container, insertBefore, 'hourglass', assets, config.mayHave2Values, false) : [undefined, undefined, undefined];
        breaksDuration[2] = TrackMetadataComponent.addContextualHelp(breaksDuration[2], 'help.contextual.breaks', [Math.floor(preferences.longBreakMinimumDuration / 60000)], assets, whenVisible, i18n);
        const estimatedDuration = !config.mergeDurationAndEstimated ? TrackMetadataComponent.createItemElement(container, insertBefore, 'chrono', assets, config.mayHave2Values, false) : [undefined, undefined, undefined];
        estimatedDuration[2] = TrackMetadataComponent.addContextualHelp(estimatedDuration[2], 'help.contextual.estimated_duration', [], assets, whenVisible, i18n);
        let empty: HTMLDivElement | undefined = undefined;
        if (config.showSpeed) {
          // empty slot
          empty = document.createElement('DIV') as HTMLDivElement;
          empty.className = 'metadata-item-container';
          if (insertBefore)
            container.insertBefore(empty, insertBefore);
          else
            container.appendChild(empty);
        }
        const distance = TrackMetadataComponent.createItemElement(container, insertBefore, 'distance', assets, config.mayHave2Values, false);
        const speed = config.showSpeed ? TrackMetadataComponent.createItemElement(container, insertBefore, 'speed', assets, config.mayHave2Values, false) : [undefined, undefined, undefined];
        const positiveElevation = TrackMetadataComponent.createItemElement(container, insertBefore, 'positive-elevation', assets, config.mayHave2Values, true);
        const negativeElevation = TrackMetadataComponent.createItemElement(container, insertBefore, 'negative-elevation', assets, config.mayHave2Values, true);
        const highestAltitudeDivs = config.showHighestAndLowestAltitude ? TrackMetadataComponent.createItemElement(container, insertBefore, 'highest-point', assets, config.mayHave2Values, true) : [undefined, undefined, undefined];
        const lowestAltitudeDivs = config.showHighestAndLowestAltitude ? TrackMetadataComponent.createItemElement(container, insertBefore, 'lowest-point', assets, config.mayHave2Values, true) : [undefined, undefined, undefined];
        const titles = new Titles(
          duration[2],
          breaksDuration[2],
          estimatedDuration[2],
          distance[2],
          speed[2],
          positiveElevation[2],
          negativeElevation[2],
          highestAltitudeDivs[2],
          lowestAltitudeDivs[2]
        );
        const meta = new Meta(distance[0], duration[0], estimatedDuration[0], breaksDuration[0], speed[0], empty, positiveElevation[0], negativeElevation[0], highestAltitudeDivs[0], lowestAltitudeDivs[0]);
        const meta2 = new Meta(distance[1], duration[1], estimatedDuration[1], breaksDuration[1], speed[1], empty, positiveElevation[1], negativeElevation[1], highestAltitudeDivs[1], lowestAltitudeDivs[1]);
        TrackMetadataComponent.toMeta(track$, meta, config, whenVisible, i18n, titles, domController, meta2, false);
        if (config.mayHave2Values) {
          TrackMetadataComponent.toMeta(track2$, meta2, config, whenVisible, i18n, titles, domController, meta, true); // NOSONAR
        }
      });
    });
  }

  private static createItemElement(parent: HTMLElement, insertBefore: HTMLElement | undefined, icon: string, assets: AssetsService, mayHave2Values: boolean, small: boolean): [HTMLDivElement, HTMLDivElement | undefined, HTMLElement] {
    const container = document.createElement('DIV');
    container.className = 'metadata-item-container' + (small ? ' metadata-content-small' : '');

    const item = document.createElement('DIV');
    item.className = 'metadata-item';
    container.appendChild(item);

    const iconContainer = document.createElement('DIV');
    iconContainer.className = 'icon';
    item.appendChild(iconContainer);
    assets.getIcon(icon).subscribe(svg => {
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
    if (mayHave2Values) {
      info2 = document.createElement('DIV') as HTMLDivElement;
      info2.className = "metadata-secondary";
      info2.style.display = 'none';
      value.appendChild(info2);
    }

    if (insertBefore)
      parent.insertBefore(container, insertBefore);
    else
      parent.appendChild(container);
    return ([info1, info2, title]);
  }

  private static addContextualHelp(titleDiv: HTMLElement | undefined, help: string, helpArgs: any[], assets: AssetsService, whenVisible: Resubscribeables, i18n: I18nService): HTMLElement | undefined {
    if (!titleDiv) return undefined;
    const titleText = document.createElement('SPAN');
    titleDiv.appendChild(titleText);
    const iconContainer = document.createElement('DIV');
    iconContainer.className = 'contextual-help';
    titleDiv.appendChild(iconContainer);
    assets.getIcon('help-circle').subscribe(svg => {
      iconContainer.appendChild(svg);
      addTooltip(iconContainer, new TranslatedString(help, helpArgs), i18n, whenVisible);
    });
    return titleText;
  }

  private static toMeta(track$: Observable<TrackType>, meta: Meta, config: TrackMetadataConfig, whenVisible: Resubscribeables, i18n: I18nService, titles: Titles, domController: DomController, meta2: Meta, hideIfUndefined: boolean): void { // NOSONAR
    let previousState = 0;
    whenVisible.subscribe(track$.pipe(
      switchMap(track => {
        if (!track) return of([undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 0]);
        if (track instanceof Track) return combineLatest([
          track.metadata.distance$,
          track.metadata.duration$,
          track.metadata.positiveElevation$,
          track.metadata.negativeElevation$,
          config.showHighestAndLowestAltitude ? track.metadata.highestAltitude$ : of(undefined),
          config.showHighestAndLowestAltitude ? track.metadata.lowestAltitude$ : of(undefined),
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
      debounceTimeExtended(0, 10, 100),
    ), ([distance, duration, positiveElevation, negativeElevation, highestAltitude, lowestAltitude, breaksDuration, estimatedDuration, state]) => {
      const force = state !== previousState;
      TrackMetadataComponent.updateMeta(meta, 'distance', distance, v => i18n.distanceToString(v), force, domController, hideIfUndefined);
      TrackMetadataComponent.updateMeta(meta, 'positiveElevation', positiveElevation, v => '+ ' + i18n.elevationToString(v), force, domController, hideIfUndefined);
      TrackMetadataComponent.updateMeta(meta, 'negativeElevation', negativeElevation, v => '- ' + i18n.elevationToString(v), force, domController, hideIfUndefined);
      if (!config.alwaysShowElevation && !hideIfUndefined) {
        TrackMetadataComponent.shown(meta.positiveElevationDiv, meta.positiveElevationValue !== undefined && meta.negativeElevationValue !== undefined);
        TrackMetadataComponent.shown(meta.negativeElevationDiv, meta.positiveElevationValue !== undefined && meta.negativeElevationValue !== undefined);
      }
      if (duration && breaksDuration) duration -= breaksDuration;
      if (duration === undefined) breaksDuration = undefined;
      if (config.showHighestAndLowestAltitude) {
        TrackMetadataComponent.updateMeta(meta, 'highestAltitude', highestAltitude, v => i18n.elevationToString(v), force, domController, hideIfUndefined);
        TrackMetadataComponent.updateMeta(meta, 'lowestAltitude', lowestAltitude, v => i18n.elevationToString(v), force, domController, hideIfUndefined);
        if (!config.alwaysShowElevation && !hideIfUndefined) {
          const hasAltitude = !!meta.highestAltitudeValue || !!meta2.highestAltitudeValue;
          TrackMetadataComponent.shown(meta.highestAltitudeDiv, hasAltitude);
          TrackMetadataComponent.shown(meta.lowestAltitudeDiv, hasAltitude);
        }
      }
      if (config.showBreaksDuration) {
        TrackMetadataComponent.updateMeta(meta, 'breaksDuration', breaksDuration, v => i18n.durationToString(v), force, domController, hideIfUndefined);
      }
      if (!config.mergeDurationAndEstimated) {
        TrackMetadataComponent.updateMeta(meta, 'estimatedDuration', estimatedDuration, v => '≈ ' + i18n.durationToString(v), force, domController, hideIfUndefined);
        TrackMetadataComponent.updateMeta(meta, 'duration', duration, v => i18n.durationToString(v), force, domController, hideIfUndefined);
        const hasDuration = !!duration || !!meta2.durationValue || !!breaksDuration || !!meta2.breaksDurationValue;
        TrackMetadataComponent.shown(meta.durationDiv, hasDuration);
        TrackMetadataComponent.shown(meta.breaksDurationDiv, hasDuration);
      } else {
        let d = duration ? i18n.durationToString(duration) : '';
        if (estimatedDuration) {
          const hasD = d.length > 0;
          if (hasD) d += ' ';
          d += '<span style="white-space: nowrap">';
          if (hasD) d += '(';
          d += '≈ ' + i18n.durationToString(estimatedDuration);
          if (hasD) d += ')';
          d += '</span>';
        }
        TrackMetadataComponent.updateMeta(meta, 'duration', d, v => v, force, domController, hideIfUndefined, true);
      }
      if (config.showSpeed) {
        const speedMetersByHour = distance && duration ? distance / duration * 60 * 60 * 1000 : undefined;
        TrackMetadataComponent.updateMeta(meta, 'speed', speedMetersByHour, v => i18n.getSpeedStringInUserUnit(i18n.getSpeedInUserUnit(v)), force, domController, hideIfUndefined);
        const hasSpeed = !!speedMetersByHour || !!meta2.speedValue;
        TrackMetadataComponent.shown(meta.speedDiv, hasSpeed);
        const hasDuration = !!duration || !!meta2.durationValue;
        meta.emptyDiv!.style.display = hasSpeed && hasDuration ? '' : 'none';
      }
      if (force) {
        titles.durationTitle.innerText = i18n.texts.metadata.duration;
        titles.distanceTitle.innerText = i18n.texts.metadata.distance;
        titles.positiveElevationTitle.innerText = i18n.texts.metadata.positiveElevation;
        titles.negativeElevationTitle.innerText = i18n.texts.metadata.negativeElevation;
        if (config.showHighestAndLowestAltitude) {
          titles.highestAltitudeTitle!.innerText = i18n.texts.metadata.highestAltitude;
          titles.lowestAltitudeTitle!.innerText = i18n.texts.metadata.lowestAltitude;
        }
        if (config.showBreaksDuration) {
          titles.breaksDurationTitle!.innerText = i18n.texts.metadata.breaksDuration;
        }
        if (!config.mergeDurationAndEstimated) {
          titles.estimatedDurationTitle!.innerText = i18n.texts.metadata.estimatedDuration;
        }
        if (config.showSpeed) {
          titles.speedTitle!.innerText = i18n.texts.metadata.averageSpeed;
        }
      }
      previousState = state as number;
    }, true);
  }

  private static updateMeta( // NOSONAR
    meta: any, key: string, value: any, toString: (value: any) => string, forceChange: boolean, domController: DomController, hideIfUndefined: boolean, isHtml: boolean = false
  ): boolean {
    if (!forceChange && meta[key  + 'Value'] === value) return false;
    meta[key + 'Value'] = value;
    const div = (meta[key + 'Div'] as HTMLDivElement);
    if (div) domController.write(() => {
      const s = value === undefined ? '' : toString(value);
      if (hideIfUndefined) {
        div.style.display = s === '' ? 'none' : '';
      }
      if (isHtml) div.innerHTML = s;
      else div.innerText = s;
    });
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
