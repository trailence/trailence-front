import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { IonDatetime, ModalController, IonContent, IonFooter, IonToolbar, IonButtons, IonButton, IonHeader, IonTitle, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { TypeUtils } from 'src/app/utils/type-utils';

@Component({
  'template': `
<ion-header>
  <ion-toolbar color="primary">
    <ion-title>
      <ion-icon name="date" style="margin-right: 10px"></ion-icon>
      <ion-label>{{ i18n.texts.metadata.trail_date }}</ion-label>
    </ion-title>
  </ion-toolbar>
</ion-header>
<ion-content>
  <ion-datetime
    color="secondary"
    [locale]="pref.preferences.lang"
    [hourCycle]="pref.preferences.hourFormat === 'H12' ? 'h12' : 'h23'"
    [value]="dateIso8601"
    (ionChange)="setDate($event.detail.value)"
  >
    <span slot="time-label">{{ i18n.texts.datetime_popup.time }}</span>
  </ion-datetime>
</ion-content>
<ion-footer>
  <ion-toolbar color="footer">
    <ion-buttons slot="start">
      <ion-button color="secondary" (click)="reset()">{{i18n.texts.buttons.reset}}</ion-button>
    </ion-buttons>
    <ion-buttons slot="end">
      <ion-button color="success" (click)="close(false)">{{i18n.texts.buttons.apply}}</ion-button>
      <ion-button (click)="close(true)">{{i18n.texts.buttons.cancel}}</ion-button>
    </ion-buttons>
  </ion-toolbar>
</ion-footer>
  `,
  imports: [
    IonDatetime, IonContent, IonFooter, IonToolbar, IonButtons, IonButton, IonHeader, IonTitle, IonIcon, IonLabel
  ],
})
export class DateTimePopup implements OnInit {

  @Input() timestamp?: number;
  @Input() defaultTimestamp?: number;

  dateIso8601?: string;

  @ViewChild('ion-datetime') ionDateTime?: IonDatetime;

  constructor(
    public readonly i18n: I18nService,
    public readonly pref: PreferencesService,
    private readonly modalController: ModalController,
  ) {}

  ngOnInit(): void {
    this.setDateFromTimestamp(this.timestamp ?? this.defaultTimestamp);
  }

  setDateFromTimestamp(timestamp?: number): void {
    if (timestamp) {
      this.dateIso8601 = TypeUtils.toIso8601NoTimezone(new Date(timestamp));
    } else {
      this.dateIso8601 = '';
    }
  }

  setDate(date: string | string[] | null | undefined): void {
    this.dateIso8601 = (date ?? undefined) as string | undefined;
  }

  reset(): void {
    this.setDateFromTimestamp(this.defaultTimestamp);
  }

  close(cancel: boolean): void {
    this.modalController.dismiss(this.dateIso8601 ? new Date(this.dateIso8601).getTime() : undefined, cancel ? 'cancel' : 'ok');
  }

}
