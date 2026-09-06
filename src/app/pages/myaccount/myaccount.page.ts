import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { HeaderComponent } from '@trailence/components/header/header.component';
import { AuthService } from '@trailence/services/auth/auth.service';
import { HttpService } from '@trailence/services/http/http.service';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { environment } from '@env/environment';
import { IonButton, ModalController } from "@ionic/angular";
import { first, switchMap } from 'rxjs';
import { NetworkService } from '@trailence/services/network/network.service';
import { filterDefined } from '@trailence/utils/rxjs/filter-defined';
import { UserKey, UserKeysComponent } from '@trailence/components/user-keys/user-keys.components';
import { Subscriptions } from '@trailence/utils/rxjs/subscription-utils';
import { UserQuotas } from '@trailence/services/auth/user-quotas';
import { QuotaService } from '@trailence/services/auth/quota.service';
import { UserQuotasComponent } from '@trailence/components/user-quotas/user-quotas.component';
import { Router } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { AvatarComponent } from '@trailence/components/avatar/avatar.component';

@Component({
  selector: 'app-myaccount',
  templateUrl: './myaccount.page.html',
  styleUrls: ['./myaccount.page.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    IonButton,
    HeaderComponent,
    UserKeysComponent,
    UserQuotasComponent,
    AsyncPipe,
    AvatarComponent,
  ]
})
export class MyaccountPage implements OnDestroy, OnInit {

  email: string;
  createdAt?: number;
  complete: boolean;
  anonymous: boolean;
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
    private readonly router: Router,
  ) {
    this.email = auth.email!;
    this.createdAt = auth.auth?.userCreatedAt;
    this.complete = auth.auth?.complete || false;
    this.anonymous = auth.auth?.complete || false;
    this.subscriptions.add(auth.auth$.subscribe(a => {
      const newComplete = a?.complete ?? false;
      const newAnonymous = a?.isAnonymous ?? false;
      if (this.complete !== newComplete || this.anonymous !== newAnonymous) {
        this.complete = newComplete;
        this.anonymous = newAnonymous;
        if (this._init)
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
    if (this.anonymous) {
      this.router.navigateByUrl('/register');
      return;
    }
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
