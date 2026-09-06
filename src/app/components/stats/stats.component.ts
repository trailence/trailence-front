import { Component, Injector, ChangeDetectionStrategy } from '@angular/core';
import { AbstractComponent } from '@trailence/utils/component-utils';
import { StatsConfig } from './stats-config';
import { AuthService } from '@trailence/services/auth/auth.service';
import { StatsConfigComponent } from "./config/stats-config.component";
import { IonAccordionGroup, IonAccordion, IonItem, IonLabel, IonIcon } from "@ionic/angular";
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { GraphComponent } from '../graph/graph.component';
import { GraphConfigSource, GraphProvider } from '../graph/graph-config';
import { GraphBuilder } from './graph-builder';

@Component({
  selector: 'app-stats',
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [IonIcon, StatsConfigComponent, GraphComponent, IonAccordionGroup, IonAccordion, IonItem, IonLabel]
})
export class StatsComponent extends AbstractComponent {

  config?: StatsConfig;
  resetChart = true;

  accordionValue: string | undefined = 'config';

  graphSource?: GraphConfigSource<StatsConfig>;
  graphProvider?: GraphProvider<StatsConfig>;

  constructor(
    injector: Injector,
    public readonly i18n: I18nService,
  ) {
    super(injector);
  }

  protected override initComponent(): void {
    this.whenVisible.subscribe(
      this.injector.get(AuthService).userChanged$,
      auth => {
        if (auth) {
          this.config = StatsConfig.load(auth.email);
          this.graphSource = { source$: this.config.config$ };
          this.graphProvider = new GraphBuilder(this.injector);
        } else {
          this.config = undefined;
        }
      }
    );
    this.resize('config');
  }

  private _timeout?: any;
  resize(value: any): void {
    this.accordionValue = value ? 'config' : undefined;
    this.resetChart = true;
    if (this._timeout) clearTimeout(this._timeout);
    this._timeout = setTimeout(() => {
      this._timeout = undefined;
      this.resetChart = false;
    }, 500);
  }

}
