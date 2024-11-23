import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonPopover, IonList, IonItem, IonIcon, IonLabel, IonContent, IonModal, IonHeader, IonToolbar, IonTitle, IonFooter, IonButtons } from '@ionic/angular/standalone';
import { combineLatest, map } from 'rxjs';
import { AuthService } from 'src/app/services/auth/auth.service';
import { DatabaseService } from 'src/app/services/database/database.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { NetworkService } from 'src/app/services/network/network.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';

@Component({
    selector: 'app-header-user-menu',
    templateUrl: './header-user-menu.component.html',
    styleUrls: ['./header-user-menu.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [IonButtons, IonFooter, IonTitle, IonToolbar, IonHeader, IonModal, IonContent, IonLabel, IonIcon, IonItem, IonList,
        IonButton,
        IonPopover,
        CommonModule,
    ]
})
export class HeaderUserMenuComponent extends AbstractComponent {

  status?: string;
  lastSync?: number;
  hasLocalChanges = false;

  id: string;
  loggingOut = false;
  userLetter = '';

  @ViewChild('logoutModal') logoutModal?: IonModal;

  constructor(
    injector: Injector,
    public i18n: I18nService,
    public auth: AuthService,
    public preferences: PreferencesService,
    private readonly databaseService: DatabaseService,
    private readonly networkService: NetworkService,
    private readonly changeDetector: ChangeDetectorRef,
    public router: Router,
  ) {
    super(injector);
    changeDetector.detach();
    this.id = IdGenerator.generateId();
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
        this.status = s;
        this.hasLocalChanges = localChanges;
        this.lastSync = lastSync;
        const email = auth?.email;
        this.userLetter = email ? email.substring(0, 1) : '';
        this.changeDetector.detectChanges();
      }
    );
  }

  logout(): void {
    this.logoutModal?.present();
  }

  doLogout(withDelete: boolean): void {
    this.loggingOut = true;
    this.auth.logout(withDelete).subscribe(() => {
      this.logoutModal?.dismiss();
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

}
