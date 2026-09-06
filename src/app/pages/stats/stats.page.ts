import { Component, Injector, ChangeDetectionStrategy } from '@angular/core';
import { HeaderComponent } from '@trailence/components/header/header.component';
import { StatsComponent } from '@trailence/components/stats/stats.component';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { AbstractPage } from '@trailence/utils/component-utils';

@Component({
  templateUrl: './stats.page.html',
  styleUrl: './stats.page.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
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
