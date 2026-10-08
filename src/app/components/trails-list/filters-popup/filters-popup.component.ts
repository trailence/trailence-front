import { Component, EventEmitter, Injector, Input, OnDestroy } from '@angular/core';
import { ModalController, AlertController, IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonCheckbox, IonButton, IonInput, IonFooter, IonButtons } from '@ionic/angular';
import { FilterNumericCustomComponent } from '@trailence/components/filters/filter-numeric-custom/filter-numeric-custom.component';
import { FilterNumericComponent, NumericFilterValueEvent } from '@trailence/components/filters/filter-numeric/filter-numeric.component';
import { FilterTagsComponent } from '@trailence/components/filters/filter-tags/filter-tags.component';
import { MenuItem } from '@trailence/components/menus/menu-item';
import { ToolbarComponent } from '@trailence/components/menus/toolbar/toolbar.component';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { PreferencesService } from '@trailence/services/preferences/preferences.service';
import { FiltersUtils } from '../filters';
import { of, Subscription } from 'rxjs';
import { ComputedPreferences, Filters } from '@trailence/services/preferences/preferences';
import { FilterNumeric, FilterTags, NumericFilterCustomConfig } from '@trailence/components/filters/filter';
import { SelectActivitiesComponent } from '@trailence/components/select/activity/select-activity.component';
import { TrailActivity } from '@trailence/model/dto/trail-activity';
import { TrailLoopType } from '@trailence/model/dto/trail-loop-type';
import { SelectLoopTypeComponent } from '@trailence/components/select/loop-type/select-loop-type.component';

export async function openFiltersPopup(
  injector: Injector,
  filters: Filters,
  onUpdate: (filters: Filters) => void,
  isFilterEligible: (filters: Filters) => boolean,
  listType: string | undefined,
  collectionUuid: string | undefined,
  searchValue$: EventEmitter<string>,
) {
  const modal = await injector.get(ModalController).create({
    component: FiltersPopupComponent,
    componentProps: {
      filters,
      onUpdate,
      isFilterEligible,
      listType,
      collectionUuid,
      searchValue$,
    },
    cssClass: 'auto-height',
  });
  await modal.present();
}

@Component({
  templateUrl: './filters-popup.component.html',
  styleUrl: './filters-popup.component.scss',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonCheckbox, IonButton, IonInput, IonFooter, IonButtons,
    ToolbarComponent,
    FilterNumericCustomComponent,
    FilterNumericComponent,
    FilterTagsComponent,
    SelectActivitiesComponent,
    SelectLoopTypeComponent,
  ]
})
export class FiltersPopupComponent implements OnDestroy {

  @Input() filters!: Filters;
  @Input() onUpdate!: (filters: Filters) => void;
  @Input() isFilterEligible!: (filters: Filters) => boolean;
  @Input() listType?: string;
  @Input() collectionUuid?: string;
  @Input() searchValue$!: EventEmitter<string>;

  private prefSubscription: Subscription;
  private updated(): void {
    this.filters = {...this.filters};
    this.onUpdate(this.filters);
  }

  constructor(
    private readonly injector: Injector,
    public readonly i18n: I18nService,
    private readonly preferences: PreferencesService,
  ) {
    this.prefSubscription = preferences.preferences$.subscribe(prefs => this.configureFilters(prefs));
  }

  ngOnDestroy(): void {
    this.prefSubscription.unsubscribe();
  }

  close(): void {
    void this.injector.get(ModalController).dismiss();
  }

  toolbarItems: MenuItem[] = [
    new MenuItem().setI18nLabel('pages.trails.filters.preset').setSectionTitle(true).setTextColor('secondary'),
    new MenuItem().setIcon('export').setI18nLabel('pages.trails.filters.load').setChildrenProvider(() => {
      const saved = this.preferences.preferences.trailFilters;
      const names = saved ? Object.keys(saved) : [];
      if (names.length === 0) return of([new MenuItem().setI18nLabel('pages.trails.filters.no_saved_filter').setDisabled(true).setAction(() => {})]);
      return of(FiltersPopupComponent.sorted(names, this.preferences.preferences.lang).map(name => {
        const systemFilter = saved![name];
        const userFilter = FiltersUtils.toUserUnit(systemFilter, this.preferences.preferences, this.i18n);
        return new MenuItem().setFixedLabel(name).setSubLabel(FiltersUtils.getDescription(userFilter, this.i18n, this.preferences.preferences))
          .setDisabled(() => !this.isFilterEligible(systemFilter))
          .setAction(() => {
            this.filters = FiltersUtils.copy(userFilter);
            this.onUpdate(this.filters);
          })
      }));
    }),
    new MenuItem().setIcon('save').setI18nLabel('pages.trails.filters.save')
      .setDisabled(() => FiltersUtils.nbActives(this.filters, true) === 0)
      .setChildrenProvider(() => {
        const children = [
          new MenuItem().setI18nLabel('pages.trails.filters.save_new').setTextColor('secondary')
          .setAction(() => {
            void this.injector.get(AlertController).create({
              header: this.i18n.texts.pages.trails.filters.save_title,
              inputs: [{
                type: 'text',
                min: 1,
                max: 100,
                label: this.i18n.texts.pages.trails.filters.save_name,
              }],
              buttons: [
                {
                  text: this.i18n.texts.buttons.ok,
                  role: 'ok'
                }, {
                  text: this.i18n.texts.buttons.cancel,
                  role: 'cancel'
                }
              ]
            }).then(a => a.present().then(() => a.onDidDismiss().then(event => { // NOSONAR
              if (event.role === 'ok') {
                const name = event.data.values[0].trim();
                if (name.length > 0) {
                  const filters = this.preferences.preferences.trailFilters ?? {};
                  filters[name] = FiltersUtils.toSystemUnit(FiltersUtils.copy(this.filters), this.preferences.preferences, this.i18n);
                  this.preferences.saveTrailFilters({...filters});
                }
              }
            })));
          })
        ];
        const saved = this.preferences.preferences.trailFilters;
        const names = saved ? Object.keys(saved) : [];
        if (names.length === 0) return of(children);
        children.push(new MenuItem());
        FiltersPopupComponent.sorted(names, this.preferences.preferences.lang).forEach(name => {
          const systemFilter = saved![name];
          const userFilter = FiltersUtils.toUserUnit(systemFilter, this.preferences.preferences, this.i18n);
          children.push(
            new MenuItem().setFixedLabel(name).setSubLabel(FiltersUtils.getDescription(userFilter, this.i18n, this.preferences.preferences))
            .setDisabled(() => !this.isFilterEligible(systemFilter))
            .setAction(() => {
              const filters = this.preferences.preferences.trailFilters ?? {};
              filters[name] = FiltersUtils.toSystemUnit(FiltersUtils.copy(this.filters), this.preferences.preferences, this.i18n);
              this.preferences.saveTrailFilters({...filters});
            })
          );
        });
        return of(children);
      }),
    new MenuItem().setIcon('trash').setI18nLabel('pages.trails.filters.remove').setChildrenProvider(() => {
      const saved = this.preferences.preferences.trailFilters;
      const names = saved ? Object.keys(saved) : [];
      return of(FiltersPopupComponent.sorted(names, this.preferences.preferences.lang).map(name => {
        const systemFilter = saved![name];
        const userFilter = FiltersUtils.toUserUnit(systemFilter, this.preferences.preferences, this.i18n);
        return new MenuItem().setFixedLabel(name).setSubLabel(FiltersUtils.getDescription(userFilter, this.i18n, this.preferences.preferences))
          .setAction(() => {
            const filters = this.preferences.preferences.trailFilters ?? {};
            delete filters[name];
            this.preferences.saveTrailFilters({...filters});
          })
      }));
    }),
  ];

  private static sorted(names: string[], locale: string): string[] {
    return names.sort((s1, s2) => s1.localeCompare(s2, locale));
  }

  durationFormatter = (value: number) => this.i18n.hoursToString(value) + (value === 24 ? '+' : '');
  formatRate = (rate: number) => rate.toLocaleString(this.preferences.preferences.lang, {maximumFractionDigits: 1});

  filterDurationConfig: NumericFilterCustomConfig = {
    range: true,
    values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 24],
    formatter: this.durationFormatter
  };

  filterDistanceConfig!: NumericFilterCustomConfig;
  filterElevationConfig!: NumericFilterCustomConfig;

  private configureFilters(prefs: ComputedPreferences): void {
    switch (prefs.distanceUnit) {
      case 'METERS':
        this.filterDistanceConfig = {
          range: true,
          values: [0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 17, 20, 25, 30, 40, 50],
          formatter: FiltersUtils.getDistanceFormatter(prefs, 50),
        };
        this.filterElevationConfig = {
          range: true,
          values: [0, 50, 100, 200, 300, 400, 500, 600, 800, 1000, 1250, 1500, 2000],
          formatter: FiltersUtils.getElevationFormatter(prefs, 2000),
        };
        break;
      case 'IMPERIAL':
        this.filterDistanceConfig = {
          range: true,
          values: [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 17, 20, 25, 30],
          formatter: FiltersUtils.getDistanceFormatter(prefs, 30),
        };
        this.filterElevationConfig = {
          range: true,
          values: [0, 200, 500, 800, 1100, 1400, 1700, 2000, 2500, 3000, 4000, 5000, 6000, 7000],
          formatter: FiltersUtils.getElevationFormatter(prefs, 7000),
        };
        break;
    }
  }

  updateNumericFilter(filter: FilterNumeric, $event: NumericFilterValueEvent): void {
    const newMin = $event.min === $event.valueMin ? undefined : $event.valueMin;
    const newMax = $event.max === $event.valueMax ? undefined : $event.valueMax;
    if (filter.from === newMin && filter.to === newMax) return;
    filter.from = newMin;
    filter.to = newMax;
    this.updated();
  }

  updateNumericCustomFilter(filter: FilterNumeric, config: NumericFilterCustomConfig, $event: FilterNumeric | number): void {
    const event = $event as FilterNumeric;
    this.updateNumericFilter(filter, {valueMin: event.from! , valueMax: event.to!, min: config.values[0], max: config.values.at(-1)!});
  }

  updateFilterOnlyVisibleOnMap(checked: boolean): void {
    if (checked === this.filters.onlyVisibleOnMap) return;
    this.filters.onlyVisibleOnMap = checked;
    this.updated();
  }

  updateFilterOnlyWithPhotos(checked: boolean): void {
    if (checked === this.filters.onlyWithPhotos) return;
    this.filters.onlyWithPhotos = checked;
    this.updated();
  }

  updateTagsFilter(filter: FilterTags): void {
    this.filters.tags = filter;
    this.updated();
  }

  updateActivitiesFilter(selected: (TrailActivity | undefined)[]): void {
    this.filters.activities.selected = selected.length > 0 ? selected : undefined;
    this.updated();
  }

  updateLoopTypeFilter(selected: TrailLoopType[]): void {
    this.filters.loopTypes.selected = selected.length > 0 ? selected : undefined;
    this.updated();
  }

  resetFilters(): void {
    FiltersUtils.reset(this.filters);
    this.updated();
  }

  searchTrailInput(event: string | null | undefined): void {
    this.searchValue$.emit(event ?? '');
  }
  clearSearch(): void {
    this.filters.search = '';
    this.updated();
  }

}
