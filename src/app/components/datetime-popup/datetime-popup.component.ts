import { Component, Input, OnInit, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { IonDatetime, ModalController, IonContent, IonFooter, IonToolbar, IonButtons, IonButton, IonHeader, IonTitle, IonIcon, IonLabel } from '@ionic/angular';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { PreferencesService } from '@trailence/services/preferences/preferences.service';
import { StringUtils } from '@trailence/utils/string-utils';
import { SelectComponent } from '../select/select.component';
import { SelectItem } from '../select/select.interface';
import { EXISTING_TIMEZONES } from '@trailence/utils/timezones';

function toSelectItem(offset: number): SelectItem<number> {
  let name = offset < 0 ? '-' : '+';
  const minutes = Math.abs(offset);
  name += StringUtils.padLeft('' + Math.floor(minutes/60), 2, '0') + ':' + StringUtils.padLeft('' + (minutes%60), 2, '0');
  return {value: offset, fixedLabel: name};
}

const Timezones: SelectItem<number>[] = EXISTING_TIMEZONES.map(toSelectItem);

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
    [max]="maxIso8601"
    (ionChange)="setDate($event.detail.value)"
  >
    <span slot="time-label">{{ i18n.texts.datetime_popup.time }}</span>
  </ion-datetime>
  @if (withTimezone) {
    <div class="timezone">
      <div class="label">{{ i18n.texts.datetime_popup.timezone }}</div>
      <div class="value">
        <span>UTC</span>
        <app-select [items]="timezones" [selection]="[selectedTimezone]" (selectionChange)="setTimezone($event)" selectStyle="fill" popupTitleKey="datetime_popup.timezone"></app-select>
      </div>
    </div>
  }
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
  styles: `
div.timezone {
  display: flex;
  flex-direction: row;
  align-items: center;
  background-color: var(--ion-background-color-step-100);
  color: var(--ion-text-color-step-350);
  padding: 2px 16px;

  div.label {
    flex: none;
  }
  div.value {
    flex: 1 1 100%;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;

    app-select {
      margin-left: 6px;
      min-width: 75px;
      color: var(--ion-text-color);
    }
  }
}
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    IonDatetime, IonContent, IonFooter, IonToolbar, IonButtons, IonButton, IonHeader, IonTitle, IonIcon, IonLabel,
    SelectComponent,
  ],
})
export class DateTimePopup implements OnInit {

  @Input() timestamp?: number;
  @Input() defaultTimestamp?: number;
  @Input() maxTimestamp?: number;
  @Input() withTimezone = false;
  @Input() timezoneOffset?: number;

  dateIso8601?: string;
  maxIso8601?: string;
  selectedTimezone?: number;

  timezones = Timezones;

  @ViewChild('ion-datetime') ionDateTime?: IonDatetime;

  constructor(
    public readonly i18n: I18nService,
    public readonly pref: PreferencesService,
    private readonly modalController: ModalController,
  ) {}

  ngOnInit(): void {
    this.dateIso8601 = this.getDateIso8601FromTimestamp(this.timestamp ?? this.defaultTimestamp) ?? '';
    this.maxIso8601 = this.getDateIso8601FromTimestamp(this.maxTimestamp);
    this.selectedTimezone = this.timezoneOffset;
  }

  getDateIso8601FromTimestamp(timestamp?: number): string | undefined {
    if (timestamp) {
      return StringUtils.dateToIso8601NoTimezone(new Date(timestamp));
    }
    return undefined;
  }

  setDate(date: string | string[] | null | undefined): void {
    this.dateIso8601 = (date ?? undefined) as string | undefined;
  }

  setTimezone(offset: (number | undefined)[]): void {
    this.selectedTimezone = offset.length > 0 ? offset[0] : undefined;
  }

  reset(): void {
    this.dateIso8601 = this.getDateIso8601FromTimestamp(this.defaultTimestamp) ?? '';
  }

  close(cancel: boolean): void {
    void this.modalController.dismiss(this.dateIso8601 ? {timestamp: new Date(this.dateIso8601).getTime(), timezoneOffset: this.withTimezone ? this.selectedTimezone : undefined} : undefined, cancel ? 'cancel' : 'ok');
  }

}
