import { Component, Injector } from '@angular/core';
import { GraphConfigSource, GraphProvider } from 'src/app/components/graph/graph-config';
import { AdminStatsAggregation, AdminStatsConfig, AdminStatsType } from './config/admin-stats-config';
import { BehaviorSubject } from 'rxjs';
import { AbstractPage } from 'src/app/utils/component-utils';
import { AdminStatsBuilder } from './config/admin-stats-builder';
import { GraphComponent } from 'src/app/components/graph/graph.component';
import { IonRadioGroup, IonRadio } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Component({
  templateUrl: './stats.page.html',
  styleUrl: './stats.page.scss',
  imports: [
    IonRadioGroup, IonRadio,
    GraphComponent,
  ]
})
export class AdminStatsPage extends AbstractPage {

  config$ = new BehaviorSubject<AdminStatsConfig>({
    type: AdminStatsType.NB_USERS,
    aggregation: AdminStatsAggregation.DAY,
  });

  graphSource: GraphConfigSource<AdminStatsConfig> = { source$: this.config$ };
  graphProvider: GraphProvider<AdminStatsConfig>;

  types = Object.values(AdminStatsType);
  aggregations = Object.values(AdminStatsAggregation);

  constructor(
    injector: Injector,
    public readonly i18n: I18nService,
  ) {
    super(injector);
    this.graphProvider = new AdminStatsBuilder(injector);
  }

  setType(type: any): void {
    if (!this.types.includes(type)) return;
    this.config$.next({...this.config$.value, type});
  }

  setAggregation(aggregation: any): void {
    if (!this.aggregations.includes(aggregation)) return;
    this.config$.next({...this.config$.value, aggregation});
  }

}
