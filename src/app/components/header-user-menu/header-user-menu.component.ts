import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonPopover, IonList, IonItem, IonIcon, IonLabel, IonContent, IonModal, IonHeader, IonToolbar, IonTitle, IonFooter, IonButtons, IonBadge } from '@ionic/angular/standalone';
import { combineLatest, map } from 'rxjs';
import { AuthService } from 'src/app/services/auth/auth.service';
import { DatabaseService } from 'src/app/services/database/database.service';
import { TranslatedString } from 'src/app/services/i18n/i18n-string';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { NetworkService } from 'src/app/services/network/network.service';
import { NotificationsService } from 'src/app/services/notifications/notifications.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';

@Component({
    selector: 'app-header-user-menu',
    templateUrl: './header-user-menu.component.html',
    styleUrls: ['./header-user-menu.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [IonBadge, IonButtons, IonFooter, IonTitle, IonToolbar, IonHeader, IonModal, IonContent, IonLabel, IonIcon, IonItem, IonList,
        IonButton,
        IonPopover,
        CommonModule,
    ]
})
export class HeaderUserMenuComponent extends AbstractComponent {

  status?: string;
  lastSync?: number;
  hasLocalChanges = false;
  icon = 'duration';

  id: string;
  loggingOut = false;
  userLetter = '';
  isAnonymous = false;

  nbUnreadNotifications = 0;
  notificationsMenuTitle = '';

  @ViewChild('logoutModal') logoutModal?: IonModal;
  @ViewChild('accountPopover') accountPopover?: IonPopover;

  constructor(
    injector: Injector,
    public readonly i18n: I18nService,
    public readonly auth: AuthService,
    public readonly preferences: PreferencesService,
    private readonly databaseService: DatabaseService,
    private readonly networkService: NetworkService,
    private readonly changeDetector: ChangeDetectorRef,
    public readonly router: Router,
    public readonly notifications: NotificationsService,
  ) {
    super(injector);
    changeDetector.detach();
    this.id = IdGenerator.generateId();
  }

  transferEvent(event: any, target: any): void {
    target.el.dispatchEvent(new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
      button: event.button,
    }));
  }

  protected override initComponent(): void {
    this.whenVisible.subscribe(
      combineLatest([
        combineLatest([this.networkService.server$, this.databaseService.syncStatus]).pipe(
          map(([connected, sync]) => {
            if (!connected) return 'offline';
            if (sync) return 'sync';
            return 'online';
          })
        ),
        this.databaseService.hasLocalChanges,
        this.databaseService.lastSync,
        this.auth.auth$
      ]),
      ([s, localChanges, lastSync, auth]) => {
        this.isAnonymous = !!auth?.isAnonymous;
        this.status = s;
        this.hasLocalChanges = localChanges && !this.isAnonymous;
        this.icon = s === 'online' && this.hasLocalChanges ? 'duration' : s;
        this.lastSync = lastSync;
        const email = auth?.email;
        this.userLetter = email ? (this.isAnonymous ? '?' : email.substring(0, 1)) : '';
        this.changeDetector.detectChanges();
      }
    );
    this.visible$.subscribe(v => {
      if (!v && this.accountPopover) this.accountPopover.dismiss();
    });
    this.whenVisible.subscribe(combineLatest([this.notifications.nbUnread$, this.i18n.texts$]), ([nb, texts]) => {
      this.nbUnreadNotifications = nb;
      if (nb === 0) this.notificationsMenuTitle = texts.notifications.menu.no_unread;
      else if (nb === 1) this.notificationsMenuTitle = texts.notifications.menu.unread_single;
      else this.notificationsMenuTitle = new TranslatedString('notifications.menu.unread_plural', [nb]).translate(this.i18n);
      this.changeDetector.detectChanges();
    });
  }

  logout(): void {
    this.logoutModal!.present();
  }

  doLogout(withDelete: boolean): void {
    this.loggingOut = true;
    this.auth.logout(withDelete).subscribe(() => {
      this.logoutModal!.dismiss();
      this.loggingOut = false;
      this.router.navigateByUrl('/');
    });
  }

  syncNow(): void {
    this.databaseService.syncNow();
  }

  resetAll(): void {
    this.databaseService.resetAll();
  }

  goToNotifications(): void {
    this.router.navigateByUrl('/notifications');
  }

}
