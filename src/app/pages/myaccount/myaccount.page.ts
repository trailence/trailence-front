import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, ViewChild } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { AuthService } from 'src/app/services/auth/auth.service';
import { HttpService } from 'src/app/services/http/http.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { environment } from 'src/environments/environment';
import { IonButton, ModalController } from "@ionic/angular/standalone";
import { first, Subscription, switchMap } from 'rxjs';
import { NetworkService } from 'src/app/services/network/network.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { UserKey, UserKeysComponent } from 'src/app/components/user-keys/user-keys.components';

@Component({
    selector: 'app-myaccount',
    templateUrl: './myaccount.page.html',
    styleUrls: ['./myaccount.page.scss'],
    imports: [IonButton, HeaderComponent, CommonModule, UserKeysComponent]
})
export class MyaccountPage implements OnDestroy {

  email: string;
  complete: boolean;

  keysProvider = () => this.network.server$.pipe(
    filterDefined(),
    first(),
    switchMap(() => this.http.get<UserKey[]>(environment.apiBaseUrl + '/auth/v1/mykeys'))
  );
  keyDelete = (id: string) => this.http.delete(environment.apiBaseUrl + '/auth/v1/mykeys/' + id);

  subscription: Subscription;

  @ViewChild('app-user-keys') keysComponent?: UserKeysComponent;

  constructor(
    public readonly i18n: I18nService,
    public readonly network: NetworkService,
    private readonly http: HttpService,
    auth: AuthService,
    private readonly modalController: ModalController,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    this.email = auth.email!;
    this.complete = auth.auth?.complete || false;
    this.subscription = auth.auth$.subscribe(a => {
      const newValue = a?.complete || false;
      if (this.complete !== newValue) {
        this.complete = newValue;
        this.changeDetector.detectChanges();
      }
    });
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
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

}
