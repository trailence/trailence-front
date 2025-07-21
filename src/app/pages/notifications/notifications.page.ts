import { ChangeDetectorRef, Component } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { NotificationItemComponent } from 'src/app/components/notifications/notification-item/notification-item.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { NotificationsService } from 'src/app/services/notifications/notifications.service';
import { IonList, IonButton, IonSpinner } from "@ionic/angular/standalone";
import { CommonModule } from '@angular/common';
import { ErrorService } from 'src/app/services/progress/error.service';

@Component({
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.scss',
  imports: [IonButton,
    IonList,
    CommonModule,
    HeaderComponent,
    NotificationItemComponent, IonSpinner]
})
export class NotificationsPage {

  loading = false;

  constructor(
    public readonly i18n: I18nService,
    public readonly notifications: NotificationsService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly errorService: ErrorService,
  ) {}

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
