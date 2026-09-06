import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { AvailableLocales, LocaleKey } from '@trailence/services/i18n/available-locales';
import { PreferencesService } from '@trailence/services/preferences/preferences.service';
import { environment } from '@env/environment';
import { IonIcon, IonButton, IonPopover, IonList, IonItem, IonLabel } from '@ionic/angular';
import { IdGenerator } from '@trailence/utils/component-utils';
import { Router } from '@angular/router';

@Component({
  selector: 'app-lang-picker',
  templateUrl: './lang-picker.component.html',
  styleUrl: './lang-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [IonIcon, IonButton, IonPopover, IonList, IonItem, IonLabel]
})
export class LangPickerComponent {

  @Input() showText = true;
  @Input() link?: string;

  id = IdGenerator.generateId();
  iconBaseUrl = environment.assetsUrl + '/i18n/';
  languagesMap = AvailableLocales;
  languagesList = Object.values(AvailableLocales);

  constructor(
    public preferences: PreferencesService,
    private readonly router: Router,
  ) {}

  followLink(lang: LocaleKey, menu: IonPopover): void {
    menu.dismiss();
    this.router.navigateByUrl('/' + lang + '/' + this.link);
  }

  setLanguage(lang: LocaleKey, menu: IonPopover): void {
    if (this.link) {
      this.followLink(lang, menu);
      return;
    }
    menu.dismiss();
    this.preferences.setLanguage(lang);
  }
}
