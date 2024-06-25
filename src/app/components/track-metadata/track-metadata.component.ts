import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Injector, Input } from '@angular/core';
import { Track } from 'src/app/model/track';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { IonIcon } from '@ionic/angular/standalone';
import { BehaviorSubject, Observable, combineLatest, map, mergeMap, of } from 'rxjs';
import { CommonModule } from '@angular/common';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrackMetadataSnapshot } from 'src/app/services/database/track-database';
import { AssetsService } from 'src/app/services/assets/assets.service';

class Meta {
  distanceValue = 0;
  durationValue = 0;
  positiveElevationValue = 0;
  negativeElevationValue = 0;

  constructor(
    public distanceDiv: HTMLDivElement,
    public durationDiv: HTMLDivElement,
    public positiveElevationDiv: HTMLDivElement,
    public negativeElevationDiv: HTMLDivElement,
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

  @Input()
  track?: Track | TrackMetadataSnapshot;

  @Input()
  track2?: Track | TrackMetadataSnapshot;

  private track$ = new BehaviorSubject<Track | TrackMetadataSnapshot | undefined>(undefined);
  private track2$ = new BehaviorSubject<Track | TrackMetadataSnapshot | undefined>(undefined);

  meta: Meta;
  meta2: Meta;

  constructor(
    injector: Injector,
    private i18n: I18nService,
    element: ElementRef,
    assets: AssetsService,
  ) {
    super(injector);
    const distance = this.createItemElement(element.nativeElement, 'distance', assets);
    const duration = this.createItemElement(element.nativeElement, 'duration', assets);
    const positiveElevation = this.createItemElement(element.nativeElement, 'positive-elevation', assets);
    const negativeElevation = this.createItemElement(element.nativeElement, 'negative-elevation', assets);
    this.meta = new Meta(distance[0], duration[0], positiveElevation[0], negativeElevation[0]);
    this.meta2 = new Meta(distance[1], duration[1], positiveElevation[1], negativeElevation[1]);
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
      mergeMap(track => {
        if (!track) return of([0, 0, 0, 0, 0]);
        if (track instanceof Track) return combineLatest([
          track.metadata.distance$,
          track.metadata.duration$,
          track.metadata.positiveElevation$,
          track.metadata.negativeElevation$,
          this.i18n.stateChanged$
        ]);
        return this.i18n.stateChanged$.pipe(map(state => ([
          track.distance,
          track.duration,
          track.positiveElevation,
          track.negativeElevation,
          state
        ])));
      })
    ), ([distance, duration, positiveElevation, negativeElevation, state]) => {
      this.updateMeta(meta, 'distance', distance, v => this.i18n.distanceToString(v), state !== previousState);
      this.updateMeta(meta, 'duration', duration, v => this.i18n.durationToString(v), state !== previousState);
      this.updateMeta(meta, 'positiveElevation', positiveElevation, v => '+ ' + this.i18n.elevationToString(v), state !== previousState);
      this.updateMeta(meta, 'negativeElevation', negativeElevation, v => '- ' + this.i18n.elevationToString(v), state !== previousState);
      previousState = state;
    })
  }

  private updateMeta(meta: any, key: string, value: any, toString: (value: any) => string, forceChange: boolean): void {
    if (!forceChange && meta[key  + 'Value'] === value) return;
    meta[key + 'Value'] = value;
    (meta[key + 'Div'] as HTMLDivElement).innerText = toString(value);
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
