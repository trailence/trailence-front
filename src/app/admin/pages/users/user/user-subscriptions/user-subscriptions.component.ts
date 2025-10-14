import { Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { UserSubscriptionDto } from 'src/app/admin/model/user-subscription';
import { HttpService } from 'src/app/services/http/http.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { ErrorService } from 'src/app/services/progress/error.service';
import { environment } from 'src/environments/environment';
import { IonSelect, IonSelectOption, IonButton, IonIcon, AlertController } from '@ionic/angular/standalone';
import { PlanDto } from 'src/app/admin/model/plan';
import { map } from 'rxjs';
import { PageResult } from 'src/app/admin/components/paginator/page-result';

@Component({
  selector: 'app-user-subscriptions',
  templateUrl: './user-subscriptions.component.html',
  styleUrl: './user-subscriptions.component.scss',
  imports: [
    IonSelect, IonSelectOption, IonButton, IonIcon,
  ]
})
export class UserSubscriptionsComponent implements OnInit {

  @Input() user!: string;
  @Output() subscriptionsChanged = new EventEmitter<boolean>();

  subscriptions: UserSubscriptionDto[] = [];
  plans: string[] = [];

  @ViewChild('newPlanSelect') newPlanSelect?: IonSelect;

  constructor(
    private readonly http: HttpService,
    private readonly errorService: ErrorService,
    public readonly i18n: I18nService,
    private readonly alertController: AlertController,
  ) {}

  ngOnInit(): void {
    this.refreshSubscriptions();
    this.http.get<PageResult<PlanDto>>(environment.apiBaseUrl + '/admin/plans/v1?page=0&size=1000').pipe(
      map(response => response.elements.map(plan => plan.name))
    ).subscribe({
      next: list => this.plans = list
    });
  }

  refreshSubscriptions(): void {
    this.http.get<UserSubscriptionDto[]>(environment.apiBaseUrl + '/admin/users/v1/' + this.user + '/subscriptions').subscribe({
      next: list => this.subscriptions = list,
      error: e => this.errorService.addNetworkError(e, 'admin.users.error', [])
    });
  }

  addSubscription(): void {
    const planName = this.newPlanSelect?.value;
    if (!planName) return;
    this.http.post<UserSubscriptionDto>(environment.apiBaseUrl + '/admin/users/v1/' + this.user + '/subscriptions', planName).subscribe({
      next: subscription => {
        this.subscriptions.push(subscription);
        this.subscriptionsChanged.emit(true);
      },
      error: e => this.errorService.addNetworkError(e, 'admin.users.error', [])
    });
  }

  async stopSubscription(subscription: UserSubscriptionDto) {
    const alert = await this.alertController.create({
      header: this.i18n.texts.buttons.delete,
      message: this.i18n.texts.admin.users.stop_subscription_confirmation,
      buttons: [
        {
          text: this.i18n.texts.buttons.yes,
          role: 'danger',
          handler: () => {
            alert.dismiss(true);
            this.doStopSubscription(subscription);
          }
        }, {
          text: this.i18n.texts.buttons.no,
          role: 'cancel'
        }
      ]
    });
    await alert.present();
  }

  private doStopSubscription(subscription: UserSubscriptionDto): void {
    this.http.delete<UserSubscriptionDto>(environment.apiBaseUrl + '/admin/users/v1/' + this.user + '/subscriptions/' + subscription.uuid).subscribe({
      next: newSubscription => {
        this.subscriptions.splice(this.subscriptions.indexOf(subscription), 1, newSubscription);
        this.subscriptionsChanged.emit(true);
      },
      error: e => this.errorService.addNetworkError(e, 'admin.users.error', [])
    });
  }

}
