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

const Timezones: SelectItem<number | 'none'>[] = [...EXISTING_TIMEZONES.map(toSelectItem), {value: 'none', labelI18n: 'datetime_popup.timezone_unspecified', selectFixedLabel: ''}];

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
      <ion-button color="success" (click)="apply()" [disabled]="!dateIso8601">{{i18n.texts.buttons.apply}}</ion-button>
      <ion-button (click)="cancel()">{{i18n.texts.buttons.cancel}}</ion-button>
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
  selectedTimezone: number | 'none' = 'none';

  timezones = Timezones;

  @ViewChild('ion-datetime') ionDateTime?: IonDatetime;

  constructor(
    public readonly i18n: I18nService,
    public readonly pref: PreferencesService,
    private readonly modalController: ModalController,
  ) {}

  ngOnInit(): void {
    this.selectedTimezone = this.timezoneOffset ?? 'none';
    this.dateIso8601 = this.getDateIso8601FromTimestamp(this.timestamp ?? this.defaultTimestamp) ?? '';
    this.maxIso8601 = this.getDateIso8601FromTimestamp(this.maxTimestamp);
  }

  private getDateIso8601FromTimestamp(timestamp?: number): string | undefined {
    if (timestamp) {
      let date = new Date(timestamp);
      if (this.selectedTimezone !== 'none' && this.withTimezone) {
        date = new Date(timestamp + (date.getTimezoneOffset() + this.selectedTimezone) * 60000);
      }
      return StringUtils.dateToIso8601NoTimezone(date);
    }
    return undefined;
  }

  setDate(date: string | string[] | null | undefined): void {
    this.dateIso8601 = (date ?? undefined) as string | undefined;
  }

  setTimezone(offset: (number | undefined | 'none')[]): void {
    const before = this.selectedTimezone;
    this.selectedTimezone = (offset.length > 0 ? offset[0] : undefined) ?? 'none';
    if (before === 'none' && this.selectedTimezone !== 'none' && this.dateIso8601) {
      // first selection of timezone => adapt the date
      this.dateIso8601 = this.getDateIso8601FromTimestamp(new Date(this.dateIso8601).getTime());
    }
  }

  reset(): void {
    this.selectedTimezone = this.timezoneOffset ?? 'none';
    this.dateIso8601 = this.getDateIso8601FromTimestamp(this.defaultTimestamp) ?? '';
  }

  apply(): void {
    if (!this.dateIso8601) {
      this.cancel();
      return;
    }
    const timezoneOffset = this.withTimezone ? (this.selectedTimezone === 'none' ? undefined : this.selectedTimezone) : undefined;
    const localDate = new Date(this.dateIso8601);
    let timestamp = localDate.getTime();
    if (timezoneOffset !== undefined) {
      timestamp -= (localDate.getTimezoneOffset() + timezoneOffset) * 60000;
    }
    void this.modalController.dismiss({timestamp, timezoneOffset}, 'ok');
  }

  cancel(): void {
    void this.modalController.dismiss(undefined, 'cancel');
  }

}
