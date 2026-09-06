import { Component, Injector, ChangeDetectionStrategy } from '@angular/core';
import { GraphConfigSource, GraphProvider } from '@trailence/components/graph/graph-config';
import { AdminStatsAggregation, AdminStatsConfig, AdminStatsType } from './config/admin-stats-config';
import { BehaviorSubject } from 'rxjs';
import { AbstractPage } from '@trailence/utils/component-utils';
import { AdminStatsBuilder } from './config/admin-stats-builder';
import { GraphComponent } from '@trailence/components/graph/graph.component';
import { IonRadioGroup, IonRadio } from '@ionic/angular';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { CollapsableSectionComponent } from '@trailence/components/collapsable-section/collapsable-section.component';

@Component({
  templateUrl: './stats.page.html',
  styleUrl: './stats.page.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    IonRadioGroup, IonRadio,
    GraphComponent,
    CollapsableSectionComponent,
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

  refresh(): void {
    this.config$.next({...this.config$.value});
  }

}
