import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { AuthService } from 'src/app/services/auth/auth.service';
import { HttpService } from 'src/app/services/http/http.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { environment } from 'src/environments/environment';
import { IonButton, ModalController } from "@ionic/angular/standalone";
import { first, switchMap } from 'rxjs';
import { NetworkService } from 'src/app/services/network/network.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { UserKey, UserKeysComponent } from 'src/app/components/user-keys/user-keys.components';
import { Subscriptions } from 'src/app/utils/rxjs/subscription-utils';
import { UserQuotas } from 'src/app/services/auth/user-quotas';
import { QuotaService } from 'src/app/services/auth/quota.service';
import { UserQuotasComponent } from 'src/app/components/user-quotas/user-quotas.component';

@Component({
    selector: 'app-myaccount',
    templateUrl: './myaccount.page.html',
    styleUrls: ['./myaccount.page.scss'],
    imports: [IonButton, HeaderComponent, CommonModule, UserKeysComponent, UserQuotasComponent]
})
export class MyaccountPage implements OnDestroy, OnInit {

  email: string;
  complete: boolean;
  quotas?: UserQuotas;

  keysProvider = () => this.network.server$.pipe(
    filterDefined(),
    first(),
    switchMap(() => this.http.get<UserKey[]>(environment.apiBaseUrl + '/auth/v1/mykeys'))
  );
  keyDelete = (id: string) => this.http.delete(environment.apiBaseUrl + '/auth/v1/mykeys/' + id);

  subscriptions = new Subscriptions();

  @ViewChild('app-user-keys') keysComponent?: UserKeysComponent;

  constructor(
    public readonly i18n: I18nService,
    public readonly network: NetworkService,
    private readonly http: HttpService,
    auth: AuthService,
    quotaService: QuotaService,
    private readonly modalController: ModalController,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    this.email = auth.email!;
    this.complete = auth.auth?.complete || false;
    this.subscriptions.add(auth.auth$.subscribe(a => {
      const newValue = a?.complete ?? false;
      if (this.complete !== newValue) {
        this.complete = newValue;
        this.changeDetector.detectChanges();
      }
    }));
    this.subscriptions.add(quotaService.quotas$.subscribe(q => {
      this.quotas = q;
      if (this._init)
        this.changeDetector.detectChanges();
    }));
  }

  private _init = false;

  ngOnInit(): void {
    this._init = true;
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  ionViewWillEnter(): void {
    this.keysComponent?.refreshKeys();
  }

  async changePassword() {
    const module = await import('./change-password/change-password.component');
    const modal = await this.modalController.create({
      component: module.ChangePasswordComponent
    });
    modal.present();
  }

  async deleteMe() {
    const module = await import('./delete-me/delete-me.component');
    const modal = await this.modalController.create({
      component: module.DeleteMeComponent
    });
    modal.present();
  }

}
