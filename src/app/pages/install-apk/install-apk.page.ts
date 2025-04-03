import { Component, Injector } from '@angular/core';
import { PublicPage } from '../public.page';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { CommonModule } from '@angular/common';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';

@Component({
  templateUrl: './install-apk.page.html',
  styleUrl: './install-apk.page.scss',
  imports: [
    HeaderComponent, CommonModule,
  ]
})
export class InstallApkPage extends PublicPage {

  constructor(
    public readonly i18n: I18nService,
    public readonly prefs: PreferencesService,
    injector: Injector,
  ) {
    super(injector);
  }

}
