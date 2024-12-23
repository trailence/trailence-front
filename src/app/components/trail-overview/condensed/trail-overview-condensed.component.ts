import { ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { TrackMetadataSnapshot } from 'src/app/services/database/track-database';
import { IonIcon, IonButton, IonCheckbox, PopoverController } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { BrowserService } from 'src/app/services/browser/browser.service';
import { MenuContentComponent } from '../../menu-content/menu-content.component';
import { TrailMenuService } from 'src/app/services/database/trail-menu.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TrailService } from 'src/app/services/database/trail.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Subscriptions } from 'src/app/utils/rxjs/subscription-utils';
import { of, switchMap } from 'rxjs';
import { TagService } from 'src/app/services/database/tag.service';

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

  @Input() selectable = false;
  @Input() selected = false;
  @Output() selectedChange = new EventEmitter<boolean>();

  @Input() showButtons = true;
  @Input() subTitle?: string;
  @Input() checkboxMode = 'md';

  duration = '';
  estimatedDuration = '';

  distance = '';
  distanceUnit = '';

  positiveElevation = '';
  negativeElevation = '';

  loopType = '';
  loopTypeIcon = '';

  tags: string[] = [];

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
      this.distance = this.i18n.distanceInLongUserUnit(this.track.distance).toLocaleString(this.i18n.textsLanguage, {maximumFractionDigits: 1, minimumFractionDigits: 1});
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

  openMenu(event: MouseEvent): void {
    const y = event.pageY;
    const h = this.browser.height;
    const remaining = h - y - 15;

    this.popoverController.create({
      component: MenuContentComponent,
      componentProps: {
        menu: this.trailMenuService.getTrailsMenu([this.trail], false, this.fromCollection ? this.trail.collectionUuid : undefined)
      },
      cssClass: 'tight-menu',
      event: event,
      side: 'right',
      dismissOnSelect: true,
      arrow: true,
    }).then(p => {
      p.style.setProperty('--offset-y', remaining < 300 ? (-300 + remaining) + 'px' : '0px');
      p.style.setProperty('--max-height', remaining < 300 ? '300px' : (h - y - 10) + 'px');
      p.present();
    });
  }

  openTrail(): void {
    this.router.navigate(['trail', this.trail.owner, this.trail.uuid], {queryParams: { from: this.router.url }});
  }
}
