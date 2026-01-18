import { FilterEnum, FilterNumeric, FilterTags } from '../filters/filter';
import { ComputedPreferences } from 'src/app/services/preferences/preferences';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrailLoopType } from 'src/app/model/dto/trail-loop-type';
import { TrailActivity } from 'src/app/model/dto/trail-activity';

export interface Filters {
  duration: FilterNumeric;
  estimatedDuration: FilterNumeric;
  distance: FilterNumeric;
  positiveElevation: FilterNumeric;
  negativeElevation: FilterNumeric;
  loopTypes: FilterEnum<TrailLoopType>;
  activities: FilterEnum<TrailActivity | undefined>;
  onlyVisibleOnMap: boolean;
  onlyWithPhotos: boolean;
  tags: FilterTags;
  search: string;
  rate: FilterNumeric;
}

export class FiltersUtils {

  public static createEmpty(): Filters {
    return {
      duration: {
        from: undefined,
        to: undefined,
      },
      estimatedDuration: {
        from: undefined,
        to: undefined,
      },
      distance: {
        from: undefined,
        to: undefined,
      },
      positiveElevation: {
        from: undefined,
        to: undefined,
      },
      negativeElevation: {
        from: undefined,
        to: undefined,
      },
      loopTypes: {
        selected: undefined
      },
      activities: {
        selected: undefined
      },
      onlyVisibleOnMap: false,
      onlyWithPhotos: false,
      tags: {
        tagsUuids: [],
        type: 'include_and',
      },
      search: '',
      rate: {
        from: undefined,
        to: undefined,
      }
    };
  }

  public static fix(filters: Filters | null | undefined): Filters {
    if (!filters) return this.createEmpty();
    return {
      duration: this.fixFilterNumeric(filters.duration),
      estimatedDuration: this.fixFilterNumeric(filters.estimatedDuration),
      distance: this.fixFilterNumeric(filters.distance),
      positiveElevation: this.fixFilterNumeric(filters.positiveElevation),
      negativeElevation: this.fixFilterNumeric(filters.negativeElevation),
      loopTypes: this.fixFilterEnum(filters.loopTypes, Object.values(TrailLoopType)),
      activities: this.fixFilterEnum(filters.activities, Object.values(TrailActivity)),
      onlyVisibleOnMap: filters.onlyVisibleOnMap ?? false,
      onlyWithPhotos: filters.onlyWithPhotos ?? false,
      search: filters.search ?? '',
      tags: filters.tags,
      rate: this.fixFilterNumeric(filters.rate),
    };
  }

  private static fixFilterNumeric(filter: FilterNumeric | null | undefined): FilterNumeric {
    if (!filter) return { from: undefined, to: undefined };
    const from = filter.from ?? undefined;
    const to = filter.to ?? undefined;
    return {
      from: typeof from === 'number' ? from : undefined,
      to: typeof to === 'number' ? to : undefined,
    };
  }

  private static fixFilterEnum<T>(filter: FilterEnum<T> | null | undefined, values: T[]): FilterEnum<T> {
    if (!filter || !Array.isArray(filter['selected'])) return { selected: undefined };
    const selected: any[] = [];
    for (const v of (filter.selected as any[])) {
      if (v === null || v === undefined) {
        if (!selected.includes(undefined)) selected.push(undefined);
      } else if (values.includes(v) && !selected.includes(v)) {
        selected.push(v);
      }
    }
    return {selected: selected.length > 0 ? selected : undefined};
  }

  public static toSystemUnit(filters: Filters, preferences: ComputedPreferences, i18n: I18nService): Filters {
    const distanceConverter = preferences.distanceUnit === 'METERS' ? 1000 : 5280;
    return {
      ...filters,
      distance: {
        from: filters.distance.from === undefined ? undefined : i18n.distanceInMetersFromUserUnit(filters.distance.from * distanceConverter),
        to: filters.distance.to === undefined ? undefined : i18n.distanceInMetersFromUserUnit(filters.distance.to * distanceConverter),
      },
      duration: {
        from: filters.duration.from === undefined ? undefined : filters.duration.from * 60 * 60 * 1000,
        to: filters.duration.to === undefined ? undefined : filters.duration.to * 60 * 60 * 1000,
      },
      estimatedDuration: {
        from: filters.estimatedDuration.from === undefined ? undefined : filters.estimatedDuration.from * 60 * 60 * 1000,
        to: filters.estimatedDuration.to === undefined ? undefined : filters.estimatedDuration.to * 60 * 60 * 1000,
      },
      positiveElevation: {
        from: filters.positiveElevation.from === undefined ? undefined : i18n.elevationInMetersFromUserUnit(filters.positiveElevation.from),
        to: filters.positiveElevation.to === undefined ? undefined : i18n.elevationInMetersFromUserUnit(filters.positiveElevation.to),
      },
      negativeElevation: {
        from: filters.negativeElevation.from === undefined ? undefined : i18n.elevationInMetersFromUserUnit(filters.negativeElevation.from),
        to: filters.negativeElevation.to === undefined ? undefined : i18n.elevationInMetersFromUserUnit(filters.negativeElevation.to),
      }
    };
  }

  public static toUserUnit(filters: Filters, preferences: ComputedPreferences, i18n: I18nService): Filters {
    const distanceConverter = preferences.distanceUnit === 'METERS' ? 1000 : 5280;
    return {
      ...filters,
      distance: {
        from: filters.distance.from === undefined ? undefined : i18n.distanceInUserUnit(filters.distance.from) / distanceConverter,
        to: filters.distance.to === undefined ? undefined : i18n.distanceInUserUnit(filters.distance.to) / distanceConverter,
      },
      duration: {
        from: filters.duration.from === undefined ? undefined : filters.duration.from / (60 * 60 * 1000),
        to: filters.duration.to === undefined ? undefined : filters.duration.to / (60 * 60 * 1000),
      },
      estimatedDuration: {
        from: filters.estimatedDuration.from === undefined ? undefined : filters.estimatedDuration.from / (60 * 60 * 1000),
        to: filters.estimatedDuration.to === undefined ? undefined : filters.estimatedDuration.to / (60 * 60 * 1000),
      },
      positiveElevation: {
        from: filters.positiveElevation.from === undefined ? undefined : i18n.elevationInUserUnit(filters.positiveElevation.from),
        to: filters.positiveElevation.to === undefined ? undefined : i18n.elevationInUserUnit(filters.positiveElevation.to),
      },
      negativeElevation: {
        from: filters.negativeElevation.from === undefined ? undefined : i18n.elevationInUserUnit(filters.negativeElevation.from),
        to: filters.negativeElevation.to === undefined ? undefined : i18n.elevationInUserUnit(filters.negativeElevation.to),
      }
    };
  }

  public static nbActives(filters: Filters, includeByName: boolean = false): number {
    let nb = 0;
    if (filters.duration.from !== undefined || filters.duration.to !== undefined) nb++;
    if (filters.estimatedDuration.from !== undefined || filters.estimatedDuration.to !== undefined) nb++;
    if (filters.distance.from !== undefined || filters.distance.to !== undefined) nb++;
    if (filters.positiveElevation.from !== undefined || filters.positiveElevation.to !== undefined) nb++;
    if (filters.negativeElevation.from !== undefined || filters.negativeElevation.to !== undefined) nb++;
    if (filters.loopTypes.selected) nb++;
    if (filters.activities.selected) nb++;
    if (filters.onlyVisibleOnMap) nb++;
    if (filters.onlyWithPhotos) nb++;
    if (filters.tags.type === 'onlyWithAnyTag' || filters.tags.type === 'onlyWithoutAnyTag' || filters.tags.tagsUuids.length !== 0) nb++;
    if (filters.rate.from !== undefined || filters.rate.to !== undefined) nb++;
    if (includeByName && filters.search?.trim()?.length) nb++;
    return nb;
  }

  public static reset(filters: Filters): void {
    filters.duration = {from: undefined, to: undefined};
    filters.estimatedDuration = {from: undefined, to: undefined};
    filters.distance = {from: undefined, to: undefined};
    filters.positiveElevation = {from: undefined, to: undefined};
    filters.negativeElevation = {from: undefined, to: undefined};
    filters.rate = {from: undefined, to: undefined};
    filters.loopTypes = {selected: undefined};
    filters.activities = {selected: undefined};
    filters.onlyVisibleOnMap = false;
    filters.onlyWithPhotos = false;
    filters.tags = {tagsUuids: [], type: 'include_and'};
    filters.search = '';
  }

  public static copy(filters: Filters): Filters {
    return {
      duration: {...filters.duration},
      estimatedDuration: {...filters.estimatedDuration},
      distance: {...filters.distance},
      positiveElevation: {...filters.positiveElevation},
      negativeElevation: {...filters.negativeElevation},
      rate: {...filters.rate},
      loopTypes: {selected: filters.loopTypes.selected},
      activities: {selected: filters.activities.selected},
      onlyVisibleOnMap: filters.onlyVisibleOnMap,
      onlyWithPhotos: filters.onlyWithPhotos,
      tags: {tagsUuids: [...filters.tags.tagsUuids], type: filters.tags.type},
      search: filters.search,
    }
  }

  public static getDescription(filters: Filters, i18n: I18nService, preferences: ComputedPreferences): string {
    const texts: string[] = [];
    let text = this.getFilterNumericDescription(filters.duration, i18n, 'duration', v => i18n.hoursToString(v));
    if (text) texts.push(text);
    text = this.getFilterNumericDescription(filters.estimatedDuration, i18n, 'estimatedDuration', v => i18n.hoursToString(v));
    if (text) texts.push(text);
    text = this.getFilterNumericDescription(filters.distance, i18n, 'distance', this.getDistanceFormatter(preferences));
    if (text) texts.push(text);
    text = this.getFilterNumericDescription(filters.positiveElevation, i18n, 'positive_elevation', this.getElevationFormatter(preferences));
    if (text) texts.push(text);
    text = this.getFilterNumericDescription(filters.negativeElevation, i18n, 'negative_elevation', this.getElevationFormatter(preferences));
    if (text) texts.push(text);
    text = this.getFilterNumericDescription(filters.rate, i18n, 'rate', v => v + '★');
    if (text) texts.push(text);
    text = this.getFilterEnumDescription(filters.loopTypes, i18n, 'loopType', v => i18n.texts.loopType[v]);
    if (text) texts.push(text);
    text = this.getFilterEnumDescription(filters.activities, i18n, 'activity', v => v ? i18n.texts.activity[v] : i18n.texts.activity.unspecified);
    if (text) texts.push(text);
    if (filters.onlyVisibleOnMap) texts.push(i18n.texts.pages.trails.filters.onlyVisibleOnMap);
    if (filters.onlyWithPhotos) texts.push(i18n.texts.pages.trails.filters.onlyWithPhotos);
    if (filters.tags.type === 'onlyWithAnyTag' || filters.tags.type === 'onlyWithoutAnyTag' || filters.tags.tagsUuids.length !== 0) texts.push(i18n.texts.pages.trails.filters.tags);
    if (filters.search?.trim()?.length) texts.push(i18n.texts.tools.search_text + ': ' + filters.search);
    return texts.join(', ');
  }

  private static getFilterNumericDescription(filter: FilterNumeric, i18n: I18nService, filterName: string, valueLabel: (value: number) => string): string | undefined {
    if (filter.from !== undefined) {
      if (filter.to !== undefined)
        return i18n.texts.pages.trails.filters[filterName] + ' ' + valueLabel(filter.from) + '..' + valueLabel(filter.to);
      return i18n.texts.pages.trails.filters[filterName] + ' >= ' + valueLabel(filter.from);
    } else if (filter.to !== undefined) {
      return i18n.texts.pages.trails.filters[filterName] + ' <= ' + valueLabel(filter.to);
    }
    return undefined;
  }

  private static getFilterEnumDescription<T>(filter: FilterEnum<T>, i18n: I18nService, filterName: string, valueLabel: (value: T) => string): string | undefined {
    if (filter.selected === undefined || filter.selected.length === 0) return undefined;
    return i18n.texts.pages.trails.filters[filterName] + ' = ' + filter.selected.map(v => valueLabel(v)).join(' ' + i18n.texts.pages.trails.filters.enum_or + ' ');
  }

  public static getDistanceFormatter(preferences: ComputedPreferences): (value: number) => string {
    switch (preferences.distanceUnit) {
      case 'METERS': return (value: number) => value.toLocaleString(preferences.lang, {maximumFractionDigits: 1}) + ' km';
      case 'IMPERIAL': return (value: number) => value.toLocaleString(preferences.lang, {maximumFractionDigits: 1}) + ' mi';
    }
  }

  public static getElevationFormatter(preferences: ComputedPreferences): (value: number) => string {
    switch (preferences.distanceUnit) {
      case 'METERS': return (value: number) => value.toLocaleString(preferences.lang, {maximumFractionDigits: 1}) + ' m';
      case 'IMPERIAL': return (value: number) => value.toLocaleString(preferences.lang, {maximumFractionDigits: 1}) + ' ft';
    }
  }

}
