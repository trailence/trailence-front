import { CommonModule } from '@angular/common';
import { Component, Injector } from '@angular/core';
import { IonIcon, IonButton } from '@ionic/angular/standalone';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { DonationStatusDto } from './donation-status';
import { HttpService } from 'src/app/services/http/http.service';
import { environment } from 'src/environments/environment';
import { Console } from 'src/app/utils/console';
import { NetworkService } from 'src/app/services/network/network.service';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { PublicPage } from '../public.page';

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
export class DonationPage extends PublicPage {

  constructor(
    injector: Injector,
    public readonly prefs: PreferencesService,
    public readonly i18n: I18nService,
    private readonly http: HttpService,
    private readonly network: NetworkService,
  ) {
    super(injector);
  }

  goals: Goal[] = [];
  private _refreshTimeout: any;

  protected override initComponent(): void {
    this.whenVisible.subscribe(this.network.server$, available => {
      if (available) this.refresh();
    });
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
    if (this.visible)
      this._refreshTimeout = setTimeout(() => this.refresh(), 60000);
  }

  amountFormatter = (v: number) => v.toLocaleString(this.prefs.preferences.lang, {minimumFractionDigits: 0, maximumFractionDigits: 2});

}
