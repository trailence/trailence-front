import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonPopover, IonList, IonItem, IonIcon, IonLabel, IonContent, IonModal, IonHeader, IonToolbar, IonTitle, IonFooter, IonButtons } from '@ionic/angular/standalone';
import { Subscription, combineLatest, distinctUntilChanged, map } from 'rxjs';
import { AuthService } from 'src/app/services/auth/auth.service';
import { DatabaseService } from 'src/app/services/database/database.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { NetworkService } from 'src/app/services/network/network.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { IdGenerator } from 'src/app/utils/component-utils';

@Component({
  selector: 'app-header-user-menu',
  templateUrl: './header-user-menu.component.html',
  styleUrls: ['./header-user-menu.component.scss'],
  standalone: true,
  imports: [IonButtons, IonFooter, IonTitle, IonToolbar, IonHeader, IonModal, IonContent, IonLabel, IonIcon, IonItem, IonList,
    IonButton,
    IonPopover,
  ]
})
export class HeaderUserMenuComponent implements OnInit, OnDestroy {

  status?: string;
  private subscription?: Subscription;

  id: string;
  loggingOut = false;

  @ViewChild('logoutModal') logoutModal?: IonModal;

  constructor(
    public i18n: I18nService,
    public auth: AuthService,
    public preferences: PreferencesService,
    private databaseService: DatabaseService,
    private networkService: NetworkService,
    private changeDetector: ChangeDetectorRef,
    public router: Router,
  ) {
    this.id = IdGenerator.generateId();
  }

  ngOnInit(): void {
    this.subscription = combineLatest([this.networkService.server$, this.databaseService.syncStatus]).pipe(
      map(([connected, sync]) => {
        if (!connected) return 'offline';
        if (sync) return 'sync';
        return 'online';
      }),
      distinctUntilChanged(),
    ).subscribe(s => {
      this.status = s;
      this.changeDetector.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
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

}
