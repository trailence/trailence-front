import { Component, Injector, ChangeDetectionStrategy } from '@angular/core';
import { PublicPage } from '../public.page';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { HeaderComponent } from '@trailence/components/header/header.component';
import { PreferencesService } from '@trailence/services/preferences/preferences.service';

@Component({
  templateUrl: './install-apk.page.html',
  styleUrl: './install-apk.page.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    HeaderComponent,
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

  langUpToDown(): string {
    switch (this.prefs.preferences.lang) {
      case 'pt': return 'br.';
      case 'es': return '';
      default: return this.prefs.preferences.lang + '.';
    }
  }

}
