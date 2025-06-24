import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Notification, NotificationsService } from 'src/app/services/notifications/notifications.service';
import { IonItem, IonLabel, IonNote } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TranslatedString } from 'src/app/services/i18n/i18n-string';
import { RouterLink } from '@angular/router';
import { RelativeDateComponent } from '../../relative-date/relative-date.component';

@Component({
  selector: 'app-notification-item',
  templateUrl: './notification-item.component.html',
  styleUrl: './notification-item.component.scss',
  imports: [IonNote, IonLabel, IonItem, RouterLink, RelativeDateComponent ]
})
export class NotificationItemComponent implements OnInit, OnDestroy {

  @Input() notification!: Notification;

  text!: (string | {link: string, text: string})[];

  private readTimeout?: any;

  constructor(
    private readonly service: NotificationsService,
    public readonly i18n: I18nService,
  ) {}

  ngOnInit(): void {
    this.text = this.i18n.textToHtml(new TranslatedString('notifications.items.' + this.notification.text + '.text', this.notification.textElements ?? []).translate(this.i18n));
    if (!this.notification.read) this.readTimeout = setTimeout(() => this.markAsRead(), 5000);
  }

  ngOnDestroy(): void {
    if (this.readTimeout) clearTimeout(this.readTimeout);
  }

  markAsRead(): void {
    if (this.notification.read) return;
    this.service.markAsRead(this.notification);
  }

}
