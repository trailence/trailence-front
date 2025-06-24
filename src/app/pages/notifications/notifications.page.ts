import { Component } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { NotificationItemComponent } from 'src/app/components/notifications/notification-item/notification-item.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { NotificationsService } from 'src/app/services/notifications/notifications.service';
import { IonList } from "@ionic/angular/standalone";
import { CommonModule } from '@angular/common';

@Component({
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.scss',
  imports: [
    IonList,
    CommonModule,
    HeaderComponent,
    NotificationItemComponent,
  ]
})
export class NotificationsPage {

  constructor(
    public readonly i18n: I18nService,
    public readonly notifications: NotificationsService,
  ) {}

}
