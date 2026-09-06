import { ChangeDetectorRef, Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { HeaderComponent } from '@trailence/components/header/header.component';
import { NotificationItemComponent } from '@trailence/components/notifications/notification-item/notification-item.component';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { Notification, NotificationsService } from '@trailence/services/notifications/notifications.service';
import { IonList, IonButton, IonSpinner, IonItem } from "@ionic/angular";
import { ErrorService } from '@trailence/services/progress/error.service';
import { combineLatest, Subscription } from 'rxjs';
import { NetworkService } from '@trailence/services/network/network.service';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    IonButton, IonList, IonSpinner, IonItem,
    HeaderComponent,
    NotificationItemComponent,
    AsyncPipe,
  ]
})
export class NotificationsPage implements OnInit, OnDestroy {

  loading = false;
  list: Notification[] = [];
  online = false;
  loaded = false;

  constructor(
    public readonly i18n: I18nService,
    public readonly notifications: NotificationsService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly errorService: ErrorService,
    private readonly network: NetworkService,
  ) {}

  private subscription?: Subscription;

  ngOnInit(): void {
    this.subscription = combineLatest([
      this.network.server$,
      this.notifications.notifications$
    ]).subscribe(([online, list]) => {
      this.online = !!online;
      this.loaded = this.notifications.loaded;
      this.list = list;
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  loadMore(): void {
    this.loading = true;
    this.notifications.loadMore().subscribe({
      complete: () => {
        this.loading = false;
        this.changeDetector.detectChanges();
      },
      error: e => {
        this.loading = false;
        this.errorService.addNetworkError(e, 'notifications.error_loading', []);
        this.changeDetector.detectChanges();
      },
    });
  }

}
