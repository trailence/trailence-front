import { Component, Input, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { StatsConfig, StatsTimeUnit, StatsValue } from '../stats-config';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { FormsModule } from '@angular/forms';
import { SelectActivitiesComponent } from '@trailence/components/select/activity/select-activity.component';
import { SelectItem } from '@trailence/components/select/select.interface';
import { SelectComponent } from '@trailence/components/select/select.component';
import { CollectionItem } from '@trailence/components/select/collection/select-collection';
import { SelectCollectionComponent } from '@trailence/components/select/collection/selection-collection.component';

@Component({
  selector: 'app-stats-config',
  templateUrl: './stats-config.component.html',
  styleUrl: './stats-config.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormsModule,
    SelectComponent,
    SelectActivitiesComponent,
    SelectCollectionComponent,
  ]
})
export class StatsConfigComponent implements OnInit {

  @Input() config!: StatsConfig;

  typesItems = Object.values(StatsValue).map(value => ({value, labelI18n: 'pages.stats.types.' + value}) as SelectItem<StatsValue>);
  timeUnitsItems = Object.values(StatsTimeUnit).map(value => ({value, labelI18n: 'pages.stats.time_units.' + value}) as SelectItem<StatsTimeUnit>);

  sources: CollectionItem[] = [];

  constructor(
    public readonly i18n: I18nService,
  ) {}

  ngOnInit(): void {
    this.sources = this.config.source.map(s => ({...s}));
  }

  setSources(sources: CollectionItem[]): void {
    this.config.source = sources.map(s => ({uuid: s.uuid, owner: s.owner}));
    this.sources = sources;
  }

}
