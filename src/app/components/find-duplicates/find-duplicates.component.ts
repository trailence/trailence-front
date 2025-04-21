import { CommonModule } from '@angular/common';
import { Component, Injector, Input, OnDestroy, OnInit } from '@angular/core';
import { IonHeader, IonFooter, IonToolbar, IonTitle, IonButtons, IonButton, IonLabel, IonIcon, IonContent, IonRadioGroup, IonRadio, IonSelect, IonSelectOption, IonInput, IonPopover, IonList, IonItem, IonSpinner, ModalController } from '@ionic/angular/standalone';
import { first, map, Observable, of, switchMap, zip } from 'rxjs';
import { Track } from 'src/app/model/track';
import { Trail } from 'src/app/model/trail';
import { TrailCollection } from 'src/app/model/trail-collection';
import { AuthService } from 'src/app/services/auth/auth.service';
import { TrackService } from 'src/app/services/database/track.service';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { I18nPipe } from 'src/app/services/i18n/i18n-string';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { estimateSimilarity } from 'src/app/services/track-edition/path-analysis/similarity';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { Subscriptions } from 'src/app/utils/rxjs/subscription-utils';
import { TrailComponent } from '../trail/trail.component';
import { TrailCollectionType } from 'src/app/model/dto/trail-collection';

export function openFindDuplicates(injector: Injector, fromCollection: string): void {
  injector.get(ModalController).create({
    component: FindDuplicatesComponent,
    backdropDismiss: false,
    cssClass: 'large-modal',
    componentProps: {
      collectionUuid: fromCollection,
    }
  }).then(modal => modal.present());
}

@Component({
  templateUrl: './find-duplicates.component.html',
  styleUrl: './find-duplicates.component.scss',
  imports: [
    IonHeader, IonFooter, IonToolbar, IonTitle, IonButtons, IonButton, IonLabel, IonIcon, IonContent,
    IonRadioGroup, IonRadio, IonSelect, IonSelectOption, IonInput, IonSpinner, IonPopover, IonList, IonItem,
    CommonModule,
    I18nPipe,
    TrailComponent,
  ]
})
export class FindDuplicatesComponent implements OnInit, OnDestroy {

  @Input() collectionUuid!: string;

  collection!: TrailCollection;
  otherCollections: TrailCollection[] = [];
  what = 'inside';
  withCollection?: string;
  threshold = 85;

  started = false;
  processing = false;
  launchNext?: () => void;
  trail1?: Trail;
  trail1$?: Observable<Trail>;
  trail2?: Trail;
  trail2$?: Observable<Trail>;
  percentDone = 0;
  deleted: Trail[] = [];
  end = false;

  private readonly subscriptions = new Subscriptions();

  constructor(
    private readonly injector: Injector,
    public readonly i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly collectionService: TrailCollectionService,
    private readonly auth: AuthService,
    private readonly trailService: TrailService,
    private readonly trackService: TrackService,
  ) {}

  ngOnInit(): void {
    this.collection = this.collectionService.getCollection(this.collectionUuid, this.auth.email!)!;
    this.subscriptions.add(this.collectionService.getAll$().pipe(collection$items()).subscribe(
      list => this.otherCollections = this.collectionService.sort(list.filter(c => c.uuid !== this.collectionUuid))
    ));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  collectionName(col: TrailCollection): string {
    return col.name.length === 0 && col.type === TrailCollectionType.MY_TRAILS ? this.i18n.texts.my_trails : col.name;
  }
  reset(): void {
    this.processing = false;
    this.started = false;
    this.percentDone = 0;
    this.trail1 = undefined;
    this.trail2 = undefined;
    this.trail1$ = undefined;
    this.trail2$ = undefined;
    this.launchNext = undefined;
    this.deleted = [];
  }

  close(): void {
    this.modalController.dismiss(null, 'cancel');
  }

  setThreshold(value: string | null | undefined): void {
    if (!value) return;
    const n = parseInt(value);
    if (!isNaN(n) && n >= 1 && n <= 100) this.threshold = n;
  }

  canStart(): boolean {
    return this.threshold >= 1 && this.threshold <= 100 && (this.what !== 'two' || !!this.withCollection);
  }

  start(): void {
    this.started = true;
    this.processing = true;
    this.percentDone = 0;
    this.deleted = [];
    this.end = false;
    let toCompare$: Observable<{source: {trail: Trail, track: Track}, target: {trail: Trail, track: Track}}[]>;
    const trailToTrackMapper = (trails: Trail[]) =>
      trails.length === 0 ? of([]) :
      zip(trails.map(trail => this.trackService.getFullTrackReady$(trail.currentTrackUuid, trail.owner).pipe(map(track => ({trail,track})))));
    if (this.what === 'inside') {
      toCompare$ = this.trailService.getAll$().pipe(
        collection$items(),
        map(list => list.filter(t => t.collectionUuid === this.collectionUuid)),
        first(),
        switchMap(trailToTrackMapper),
        map(source => {
          const toCompare: {source: {trail: Trail, track: Track}, target: {trail: Trail, track: Track}}[] = [];
          for (let i = 0; i < source.length; ++i) {
            for (let j = i + 1; j < source.length; ++j) {
              toCompare.push({source: source[i], target: source[j]});
            }
          }
          return toCompare;
        })
      );
    } else if (this.what === 'two') {
      toCompare$ = this.trailService.getAll$().pipe(
        collection$items(),
        first(),
        map(list => ({source: list.filter(t => t.collectionUuid === this.collectionUuid), target: list.filter(t => t.collectionUuid === this.withCollection)})),
        switchMap(sourcesAndTarget => zip(
          trailToTrackMapper(sourcesAndTarget.source),
          trailToTrackMapper(sourcesAndTarget.target)
        )),
        map(([source, target]) => {
          const toCompare: {source: {trail: Trail, track: Track}, target: {trail: Trail, track: Track}}[] = [];
          for (const src of source)
            for (const tgt of target)
              toCompare.push({source: src, target: tgt});
          return toCompare;
        })
      );
    } else {
      toCompare$ = this.trailService.getAll$().pipe(
        collection$items(),
        first(),
        switchMap(trailToTrackMapper),
        map(source => {
          const toCompare: {source: {trail: Trail, track: Track}, target: {trail: Trail, track: Track}}[] = [];
          for (let i = 0; i < source.length; ++i) {
            for (let j = i + 1; j < source.length; ++j) {
              toCompare.push({source: source[i], target: source[j]});
            }
          }
          return toCompare;
        })
      );
    }
    toCompare$.pipe(first()).subscribe(toCompare => this.next(toCompare, 0, Date.now(), 0));
  }

  private next(toCompare: {source: {trail: Trail, track: Track}, target: {trail: Trail, track: Track}}[], index: number, startTime: number, deep: number): void {
    if (index >= toCompare.length) {
      this.end = true;
      this.reset();
      return;
    }
    this.percentDone = Math.floor(index  * 100 / toCompare.length);
    const source = toCompare[index].source;
    const target = toCompare[index].target;
    if (this.deleted.find(t => (t.uuid === source.trail.uuid && t.owner === source.trail.owner) || (t.uuid === target.trail.uuid && t.owner === target.trail.owner))) {
      this.next(toCompare, index + 1, startTime, deep + 1);
      return;
    }
    const similarity = estimateSimilarity(source.track, target.track);
    if (similarity * 100 < this.threshold) {
      if (Date.now() - startTime < 1000 && deep < 100) this.next(toCompare, index + 1, startTime, deep + 1);
      else setTimeout(() => this.next(toCompare, index + 1, Date.now(), 0), 0);
      return;
    }
    this.trail1$ = of(source.trail);
    this.trail2$ = of(target.trail);
    this.trail1 = source.trail;
    this.trail2 = target.trail;
    this.processing = false;
    this.launchNext = () => {
      this.processing = true;
      this.launchNext = undefined;
      setTimeout(() => this.next(toCompare, index + 1, Date.now(), 0), 0);
    };
  }

  async deleteTrail(trail: Trail) {
    const module = await import('../../services/functions/delete-trails');
    const deleted = await module.confirmDeleteTrails(this.injector, [trail], false);
    if (deleted) {
      this.deleted.push(trail);
      this.launchNext!();
    }
  }

}
