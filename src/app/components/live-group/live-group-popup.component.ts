import { Component, Injector, Input, OnDestroy, OnInit } from '@angular/core';
import { LiveGroupDto, LiveGroupService } from 'src/app/services/live-group/live-group.service';
import { IonHeader, IonToolbar, IonIcon, IonLabel, IonButtons, IonButton, IonContent, IonFooter, IonTitle, IonInput, ModalController, IonCheckbox } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { FormsModule } from '@angular/forms';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { ErrorService } from 'src/app/services/progress/error.service';
import { NetworkService } from 'src/app/services/network/network.service';
import { AsyncPipe } from '@angular/common';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Trail } from 'src/app/model/trail';
import { TrailService } from 'src/app/services/database/trail.service';
import { TrailLinkService } from 'src/app/services/database/link.service';
import { Subscriptions } from 'src/app/utils/rxjs/subscription-utils';
import { CollapsableSectionComponent } from '../collapsable-section/collapsable-section.component';
import { TooltipDirective } from '../tooltip/tooltip.directive';

export function openCreateLiveGroupPopup(injector: Injector, trailOwner?: string, trailUuid?: string): Promise<LiveGroupDto | null> {
  return injector.get(ModalController).create({
    component: LiveGroupPopup,
    componentProps: {trailOwner, trailUuid},
  })
  .then(m => m.present().then(() => m.onDidDismiss()).then(r => r.role === 'create' ? r.data || null : null));
}

export function openEditLiveGroupPopup(injector: Injector, group: LiveGroupDto, newTrailOwner: string | undefined, newTrailUuid: string | undefined): void {
  injector.get(ModalController).create({
    component: LiveGroupPopup,
    componentProps: {group, trailOwner: newTrailOwner || group.trailOwner, trailUuid: newTrailUuid || group.trailUuid},
  })
  .then(m => m.present());
}

export const LAST_NAME_STORAGE_KEY_PREFIX = 'trailence.live-group.last-name.';

@Component({
  templateUrl: './live-group-popup.component.html',
  styleUrl: './live-group-popup.component.scss',
  imports: [
    IonHeader, IonToolbar, IonIcon, IonLabel, IonButtons, IonButton, IonContent, IonFooter, IonTitle, IonInput, IonCheckbox,
    FormsModule,
    AsyncPipe,
    CollapsableSectionComponent,
    TooltipDirective,
  ]
})
export class LiveGroupPopup implements OnInit, OnDestroy {

  @Input() group?: LiveGroupDto;
  @Input() trailOwner?: string;
  @Input() trailUuid?: string;

  name: string = '';
  myName: string = '';
  trail?: Trail;
  previousTrail?: Trail;
  trailNeedsPublicLink = false;
  trailHasPublicLink = false;
  trailOwned = false;
  shareTrail = false;

  private readonly subscriptions = new Subscriptions();

  constructor(
    public readonly i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly preferencesService: PreferencesService,
    private readonly liveGroupService: LiveGroupService,
    private readonly errorService: ErrorService,
    public readonly network: NetworkService,
    private readonly authService: AuthService,
    private readonly trailService: TrailService,
    private readonly linkService: TrailLinkService,
    private readonly injector: Injector,
  ) {}

  ngOnInit(): void {
    if (this.group) {
      this.name = this.group.name;
      this.myName = this.group.members.find(m => m.you)?.name || '';
      this.shareTrail = this.group.trailShared;
    } else {
      this.myName = this.preferencesService.preferences.alias;
      if (this.myName.length === 0) {
        const lastName = localStorage.getItem(LAST_NAME_STORAGE_KEY_PREFIX + this.authService.email);
        if (lastName) this.myName = lastName;
      }
    }
    if (this.trailOwner && this.trailUuid) {
      this.subscriptions.add(this.trailService.getTrail$(this.trailUuid, this.trailOwner).subscribe(t => this.trail = t || undefined));
      if (this.group?.trailOwner && this.group.trailUuid)
        this.subscriptions.add(this.trailService.getTrail$(this.group.trailUuid, this.group.trailOwner).subscribe(t => this.previousTrail = t || undefined));
      this.trailNeedsPublicLink = this.trailOwner.includes('@');
      this.trailOwned = this.trailOwner === this.authService.email;
      if (this.trailNeedsPublicLink && this.trailOwned)
        this.subscriptions.add(this.linkService.getLinkForTrail$(this.trailUuid).subscribe(l => this.trailHasPublicLink = !!l));
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  close(): void {
    this.modalController.dismiss();
  }

  isValid(): boolean {
    const name = this.name.trim();
    if (name.length === 0 || name.length > 30) return false;
    const myName = this.myName.trim();
    if (myName.length === 0 || myName.length > 25) return false;
    return true;
  }

  isChanged(): boolean {
    if (!this.group) return true;
    const name = this.name.trim();
    if (name !== this.group.name) return true;
    const myName = this.myName.trim();
    if (myName !== this.group.members.find(m => m.you)?.name) return true;
    if (this.shareTrail !== this.group.trailShared && this.group.trailOwner) return true;
    if (this.trailOwner !== this.group.trailOwner || this.trailUuid !== this.group.trailUuid) return true;
    return false;
  }

  createPublicLink(): void {
    import('../trail-link-popup/trail-link-popup.component')
    .then(m => m.openTrailLink(this.injector, this.group?.trailUuid || this.trailUuid!));
  }

  removeTrail(): void {
    this.trailOwner = undefined;
    this.trailUuid = undefined;
    this.trail = undefined;
  }

  saving = false;

  create(): void {
    if (this.group) return;
    const name = this.name.trim();
    const myName = this.myName.trim();
    this.saving = true;
    this.liveGroupService.createGroup({
      groupName: name,
      myName,
      trailOwner: this.trailOwner,
      trailUuid: this.trailUuid,
      trailShared: this.shareTrail,
    }).subscribe({
      next: group => {
        this.group = group;
        this.saving = false;
        this.modalController.dismiss(group, 'create');
        localStorage.setItem(LAST_NAME_STORAGE_KEY_PREFIX + this.authService.email, myName);
      },
      error: e => {
        this.errorService.addNetworkError(e, 'pages.live_group.create_error', []);
        this.saving = false;
      }
    });
  }

  save(): void {
    if (!this.group) return;
    this.saving = true;
    const name = this.name.trim();
    const myName = this.myName.trim();
    this.liveGroupService.updateGroup(this.group.slug, {
      groupName: name,
      myName,
      trailOwner: this.trailOwner,
      trailUuid: this.trailUuid,
      trailShared: this.shareTrail,
    }).subscribe({
      next: group => {
        this.group = group;
        this.saving = false;
        localStorage.setItem(LAST_NAME_STORAGE_KEY_PREFIX + this.authService.email, myName);
      },
      error: e => {
        this.errorService.addNetworkError(e, 'pages.live_group.save_error', []);
        this.saving = false;
      }
    });
  }

}
