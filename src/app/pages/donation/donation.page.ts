import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { IonIcon, IonButton } from '@ionic/angular/standalone';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { DonationStatusDto } from './donation-status';
import { HttpService } from 'src/app/services/http/http.service';
import { environment } from 'src/environments/environment';
import { Console } from 'src/app/utils/console';
import { NetworkService } from 'src/app/services/network/network.service';
import { Subscription } from 'rxjs';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';

interface Goal {
  type: string;
  amount: number;
  current: number;
}

@Component({
  selector: 'app-donation-page',
  templateUrl: './donation.page.html',
  styleUrl: './donation.page.scss',
  imports: [
    CommonModule,
    IonIcon, IonButton,
    HeaderComponent,
  ]
})
export class DonationPage implements OnInit, OnDestroy {

  constructor(
    public readonly prefs: PreferencesService,
    public readonly i18n: I18nService,
    private readonly http: HttpService,
    private readonly network: NetworkService,
  ) {}

  networkSubscription?: Subscription;
  goals: Goal[] = [];
  private _refreshTimeout: any;

  ngOnInit(): void {
    this.ionViewWillEnter();
  }

  ngOnDestroy(): void {
    this.ionViewWillLeave();
  }

  ionViewWillEnter(): void {
    if (this.networkSubscription === undefined)
      this.networkSubscription = this.network.server$.subscribe(available => {
        if (available) this.refresh();
      });
  }

  ionViewWillLeave(): void {
    this.networkSubscription?.unsubscribe();
    this.networkSubscription = undefined;
  }

  refresh(): void {
    if (this._refreshTimeout) clearTimeout(this._refreshTimeout);
    this._refreshTimeout = undefined;
    if (!this.network.server) return;
    this.http.get<DonationStatusDto>(environment.apiBaseUrl + '/donation/v1/status')
    .subscribe({
      next: status => {
        let remaining = status.currentDonations / 1000000;
        status.goals.sort((g1, g2) => g1.index - g2.index);
        this.goals = [];
        for (const g of status.goals) {
          const amount = g.amount / 100;
          const goal = {
            type: g.type,
            amount,
            current: remaining > amount ? amount : remaining
          } as Goal;
          this.goals.push(goal);
          remaining -= goal.current;
        }
        this.refreshTimeout();
      },
      error: e => {
        Console.error(e);
        this.refreshTimeout();
      }
    });
  }

  private refreshTimeout(): void {
    this._refreshTimeout = setTimeout(() => this.refresh(), 60000);
  }

  amountFormatter = (v: number) => v.toLocaleString(this.prefs.preferences.lang, {minimumFractionDigits: 0, maximumFractionDigits: 2});

}