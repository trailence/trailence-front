import { Component, Input } from '@angular/core';
import { AvailableLocales, LocaleKey } from 'src/app/services/i18n/available-locales';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { environment } from 'src/environments/environment';
import { IonIcon, IonButton, IonPopover, IonList, IonItem, IonLabel } from '@ionic/angular/standalone';
import { IdGenerator } from 'src/app/utils/component-utils';
import { Router } from '@angular/router';

@Component({
  selector: 'app-lang-picker',
  templateUrl: './lang-picker.component.html',
  styleUrl: './lang-picker.component.scss',
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
    if (this.link) return;
    menu.dismiss();
    this.preferences.setLanguage(lang);
  }
}
