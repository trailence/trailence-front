import { Component, Injector } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { StatsComponent } from 'src/app/components/stats/stats.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { AbstractPage } from 'src/app/utils/component-utils';

@Component({
  templateUrl: './stats.page.html',
  styleUrl: './stats.page.scss',
  imports: [
    HeaderComponent, StatsComponent
  ]
})
export class StatsPage extends AbstractPage {

  constructor(
    public readonly i18n: I18nService,
    injector: Injector,
  ) {
    super(injector);
  }

}
