import { ChangeDetectorRef, Component, EventEmitter, Injector, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { TrackMetadataSnapshot } from 'src/app/services/database/track-database';
import { IonIcon, IonButton, IonCheckbox, PopoverController } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { BrowserService } from 'src/app/services/browser/browser.service';
import { MenuContentComponent } from '../../menus/menu-content/menu-content.component';
import { TrailMenuService } from 'src/app/services/database/trail-menu.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TrailService } from 'src/app/services/database/trail.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Subscriptions } from 'src/app/utils/rxjs/subscription-utils';
import { firstValueFrom, of, switchMap } from 'rxjs';
import { TagService } from 'src/app/services/database/tag.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';

@Component({
  selector: 'app-trail-overview-condensed',
  templateUrl: './trail-overview-condensed.component.html',
  styleUrl: './trail-overview-condensed.component.scss',
  imports: [
    IonIcon, IonButton, IonCheckbox,
    CommonModule,
  ]
})
export class TrailOverviewCondensedComponent implements OnChanges, OnInit, OnDestroy {

  @Input() trail!: Trail;
  @Input() track!: TrackMetadataSnapshot | null;

  @Input() fromCollection = true;
  @Input() isAllCollections = false;

  @Input() selectable = false;
  @Input() selected = false;
  @Output() selectedChange = new EventEmitter<boolean>();

  @Input() subTitle?: string;
  @Input() checkboxMode = 'md';
  @Input() hideMenu = false;

  duration = '';
  estimatedDuration = '';

  distance = '';
  distanceUnit = '';

  positiveElevation = '';
  negativeElevation = '';

  loopType = '';
  loopTypeIcon = '';

  tags: string[] = [];

  openUrl?: string;

  private readonly subscriptions = new Subscriptions();

  constructor(
    private readonly i18n: I18nService,
    private readonly auth: AuthService,
    private readonly browser: BrowserService,
    private readonly router: Router,
    private readonly popoverController: PopoverController,
    private readonly trailMenuService: TrailMenuService,
    private readonly trailService: TrailService,
    private readonly tagService: TagService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly ngZone: NgZone,
    private readonly prefService: PreferencesService,
    private readonly injector: Injector,
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(
      this.auth.auth$.pipe(
        switchMap(a => a?.email === this.trail.owner ? this.tagService.getTrailTagsFullNames$(this.trail.uuid) : of([]))
      ).subscribe(tagsNames => {
        this.tags = tagsNames;
        this.ngZone.run(() => this.changeDetector.detectChanges());
      })
    );
    this.subscriptions.add(
      this.trail.name$.subscribe(() => this.ngZone.run(() => this.changeDetector.detectChanges()))
    );
    this.openUrl = '/trail/' + this.trail.owner + '/' + this.trail.uuid;
    if (this.trail.fromModeration) this.openUrl += '/moderation';
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['track']) this.updateTrack();
  }

  private updateTrack() {
    if (this.track) {
      this.duration = this.i18n.durationToString(this.track.duration, true);
      this.estimatedDuration = '≈ ' + this.i18n.durationToString(this.track.estimatedDuration, true);
      this.distance = this.i18n.distanceInLongUserUnit(this.track.distance).toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 1, minimumFractionDigits: 1});
      this.distanceUnit = this.i18n.longUserDistanceUnit();
      this.positiveElevation = this.track.positiveElevation ? '+ ' + Math.round(this.i18n.elevationInUserUnit(this.track.positiveElevation)) : '';
      this.negativeElevation = this.track.negativeElevation ? '- ' + Math.round(this.i18n.elevationInUserUnit(this.track.negativeElevation)) : '';
      this.loopType = this.trail.loopType ? this.i18n.texts.loopType[this.trail.loopType] : '';
      if (this.loopType) this.loopTypeIcon = this.trailService.getLoopTypeIcon(this.trail.loopType);
    }
  }

  setSelected(selected: boolean) {
    if (selected === this.selected) return;
    this.selected = selected;
    this.selectedChange.emit(selected);
  }

  async openMenu(event: MouseEvent) {
    event.stopPropagation();
    const y = event.pageY;
    const h = this.browser.height;
    const remaining = h - y - 15;

    const collection = this.fromCollection ?
      await firstValueFrom(
        this.injector.get(TrailCollectionService).getCollection$(this.trail.collectionUuid, this.injector.get(AuthService).email ?? '').pipe(filterDefined())
      ) : undefined;
    const menu = this.trailMenuService.getTrailsMenu([this.trail], false, collection, false, this.isAllCollections);
    let estimatedHeight = 16;
    for (const item of menu) {
      if (item.isSeparator()) estimatedHeight += 2;
      else estimatedHeight += 31;
    }
    if (menu.length && menu[0].isSectionTitle()) {
      // if items become toolbars, we should take it into account
      const i1 = menu.findIndex((item, index) => index > 0 && (item.isSeparator() || item.isSectionTitle()));
      if (i1 <= 6 && i1 > 0) {
        estimatedHeight = estimatedHeight - i1 * 31 + 80;
        const i2 = menu.findIndex((item, index) => index > i1 && (item.isSeparator() || item.isSectionTitle()));
        if (i2 > 0 && (i2 - i1) <= 6) {
          estimatedHeight = estimatedHeight - (i2 - i1) * 31 + 80;
        }
      }
    }
    const offsetY = estimatedHeight <= remaining ? 0 : Math.max(-y + 25, remaining - estimatedHeight);
    const maxHeight = remaining - offsetY;

    const popover = await this.popoverController.create({
      component: MenuContentComponent,
      componentProps: {
        menu,
        enableToolbarsForSections: 2,
      },
      cssClass: 'always-tight-menu',
      event: event,
      side: 'right',
      dismissOnSelect: true,
      arrow: true,
    });
    popover.style.setProperty('--offset-y', offsetY + 'px');
    popover.style.setProperty('--max-height', maxHeight + 'px');
    await popover.present();
  }

  openTrail(): void {
    if (this.trail.fromModeration)
      this.router.navigate(['trail', this.trail.owner, this.trail.uuid, 'moderation'], {queryParams: { from: this.router.url }});
    else
      this.router.navigate(['trail', this.trail.owner, this.trail.uuid], {queryParams: { from: this.router.url }});
  }
}
