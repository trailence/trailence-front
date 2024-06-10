import { Component, OnDestroy, OnInit } from '@angular/core';
import { IonButton, IonPopover, IonList, IonItem, IonIcon, IonLabel, IonContent } from '@ionic/angular/standalone';
import { Subscription, combineLatest, distinctUntilChanged, map } from 'rxjs';
import { AuthService } from 'src/app/services/auth/auth.service';
import { DatabaseService } from 'src/app/services/database/database.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { NetworkService } from 'src/app/services/network/newtork.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { IdGenerator } from 'src/app/utils/component-utils';

@Component({
  selector: 'app-header-user-menu',
  templateUrl: './header-user-menu.component.html',
  styleUrls: ['./header-user-menu.component.scss'],
  standalone: true,
  imports: [IonContent, IonLabel, IonIcon, IonItem, IonList,
    IonButton,
    IonPopover,
  ]
})
export class HeaderUserMenuComponent implements OnInit, OnDestroy {

  status?: string;
  private subscription?: Subscription;

  id: string;

  constructor(
    public i18n: I18nService,
    public auth: AuthService,
    public preferences: PreferencesService,
    private databaseService: DatabaseService,
    private networkService: NetworkService,
  ) {
    this.id = IdGenerator.generateId();
  }

  ngOnInit(): void {
    this.subscription = combineLatest([this.networkService.connected$, this.databaseService.syncStatus]).pipe(
      map(([connected, sync]) => {
        if (!connected) return 'offline';
        if (sync) return 'sync';
        return 'online';
      }),
      distinctUntilChanged(),
    ).subscribe(s => this.status = s);
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

}
