import { Component, Injector, Input } from '@angular/core';
import { StatsConfig, StatsTimeUnit, StatsValue } from '../stats-config';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonSelect, IonSelectOption } from "@ionic/angular/standalone";
import { FormsModule } from '@angular/forms';
import { StatsSourceSelectionComponent } from "./source-selection/stats-source-selection.component";
import { TrailActivity } from 'src/app/model/trail';

@Component({
  selector: 'app-stats-config',
  templateUrl: './stats-config.component.html',
  styleUrl: './stats-config.component.scss',
  imports: [
    IonSelect, IonSelectOption,
    FormsModule,
    StatsSourceSelectionComponent
  ]
})
export class StatsConfigComponent {

  @Input() config!: StatsConfig;

  types = Object.values(StatsValue);
  timeUnits = Object.values(StatsTimeUnit);

  constructor(
    public readonly i18n: I18nService,
    private readonly injector: Injector,
  ) {}

  getActivityFilterText(): string {
    if (this.config.activities.length === 0)
      return this.i18n.texts.pages.stats.activities.all;
    if (this.config.activities.length === 1)
      return this.activityName(this.config.activities[0]);
    if (this.config.activities.length === 2)
      return this.activityName(this.config.activities[0]) + ' ' + this.i18n.texts.pages.stats.activities.or + ' ' + this.activityName(this.config.activities[1]);
    return '' + this.config.activities.length + ' ' + this.i18n.texts.pages.stats.activities.n_activities;
  }

  private activityName(value: TrailActivity | undefined): string {
    return this.i18n.texts.activity[value ?? 'unspecified'];
  }

  openActivitiesFilter(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    import('../../activity-popup/activity-popup.component')
    .then(m => m.openActivitiesSelectionPopup(this.injector, this.config.activities, s => this.config.activities = s));
  }
}
