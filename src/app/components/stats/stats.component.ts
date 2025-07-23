import { Component, Injector } from '@angular/core';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { StatsConfig } from './stats-config';
import { AuthService } from 'src/app/services/auth/auth.service';
import { StatsConfigComponent } from "./config/stats-config.component";
import { StatsGraphComponent } from "./graph/stats-graph.component";
import { IonAccordionGroup, IonAccordion, IonItem, IonLabel, IonIcon } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Component({
  selector: 'app-stats',
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.scss',
  imports: [IonIcon, StatsConfigComponent, StatsGraphComponent, IonAccordionGroup, IonAccordion, IonItem, IonLabel]
})
export class StatsComponent extends AbstractComponent {

  config?: StatsConfig;
  resetChart = false;

  accordionValue: string | undefined = 'config';

  constructor(
    injector: Injector,
    public readonly i18n: I18nService,
  ) {
    super(injector);
  }

  protected override initComponent(): void {
    this.whenVisible.subscribe(
      this.injector.get(AuthService).auth$,
      auth => {
        if (!auth) {
          this.config = undefined;
        } else {
          this.config = StatsConfig.load(auth.email);
        }
      }
    );
  }

  resize(value: any): void {
    this.accordionValue = value ? 'config' : undefined;
    // TODO debounceTime
    this.resetChart = true;
    setTimeout(() => {
      this.resetChart = false;
    }, 250);
  }

}
