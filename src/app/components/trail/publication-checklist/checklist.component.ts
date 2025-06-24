import { ChangeDetectorRef, Component, Injector, Input, OnDestroy, OnInit } from '@angular/core';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonHeader, IonToolbar, IonIcon, IonLabel, IonContent, IonInput, IonFooter, IonButtons, IonButton, ModalController, IonCheckbox, IonTextarea } from "@ionic/angular/standalone";
import { PublicationChecklist } from './checklist';
import { Trail } from 'src/app/model/trail';
import { TrailService } from 'src/app/services/database/trail.service';
import { CommonModule } from '@angular/common';
import { TrailMenuService } from 'src/app/services/database/trail-menu.service';
import { Track } from 'src/app/model/track';
import { Observable, Subscription } from 'rxjs';

@Component({
  templateUrl: './checklist.component.html',
  styleUrl: './checklist.component.scss',
  imports: [IonTextarea, IonCheckbox, IonButton, IonButtons, IonFooter, IonInput, IonContent, IonLabel, IonIcon, IonToolbar, IonHeader, CommonModule ]
})
export class CheckListComponent implements OnInit, OnDestroy {

  @Input() checklist!: PublicationChecklist;
  @Input() trail$!: Observable<Trail | null>;
  @Input() track$!: Observable<Track | null>;

  constructor(
    public readonly i18n: I18nService,
    private readonly modalController: ModalController,
    public readonly trailService: TrailService,
    private readonly trailMenuService: TrailMenuService,
    private readonly injector: Injector,
    private readonly changeDetector: ChangeDetectorRef,
  ) {}

  trail: Trail | null = null;
  track: Track | null = null;
  trailSubscription?: Subscription;
  trackSubscription?: Subscription;

  ngOnInit(): void {
    let _init = false;
    this.trailSubscription = this.trail$.subscribe(t => {
      this.trail = t;
      if (_init) this.changeDetector.detectChanges();
    });
    this.trackSubscription = this.track$.subscribe(t => {
      this.track = t;
      if (_init) this.changeDetector.detectChanges();
    });
    _init = true;
  }

  ngOnDestroy(): void {
    this.trailSubscription?.unsubscribe();
    this.trackSubscription?.unsubscribe();
  }

  close(): void {
    this.modalController.dismiss();
  }

  check(item: string, checked: boolean): void {
    this.checklist.items[item] = checked;
    this.checklist.save();
  }

  itemCorrect(item: string): boolean {
    let result = true;
    switch (item) {
      case 'name': result = !!this.trail && this.trail.name.length > 3 && this.trail.name.length <= 200; break;
      case 'description': result = !!this.trail && this.trail.description.length > 50 && this.trail.description.length <= 50000; break;
      case 'date': result = !!this.trail?.date; break;
      case 'location': result = !!this.trail && this.trail.location.length > 2; break;
      case 'activity': result = !!this.trail?.activity; break;
      default: result = !!this.trail; break;
    }
    if (!result) this.checklist.items[item] = false;
    return result;
  }

  updateTrailName(value: string | null | undefined): void {
    if (!value || !this.trail) return;
    this.trailService.doUpdate(this.trail, t => t.name = value, () => this.changeDetector.detectChanges());
  }

  updateTrailDescription(value: string | null | undefined): void {
    if (!value || !this.trail) return;
    this.trailService.doUpdate(this.trail, t => t.description = value, () => this.changeDetector.detectChanges());
  }

  openDateDialog(): void {
    if (!this.trail || !this.track) return;
    this.trailMenuService.openTrailDatePopup(this.trail, this.track).then(d => { if (d) this.changeDetector.detectChanges(); });
  }

  openLocationDialog(): void {
    if (!this.trail) return;
    import('../../location-popup/location-popup.component').then(m => m.openLocationDialog(this.injector, this.trail!).then(() => this.changeDetector.detectChanges()));
  }

  openActivityDialog(): void {
    if (!this.trail) return;
    import('../../activity-popup/activity-popup.component').then(m => m.openActivityDialog(this.injector, [this.trail!])).then(() => this.changeDetector.detectChanges());
  }

}
