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
      search: filters.search ?? '',
      tags: filters.tags, // TODO
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
    const selected = [];
    for (const v of (filter.selected as any[])) {
      if (v === null || v === undefined) {
        if (selected.indexOf(undefined) < 0) selected.push(undefined);
      } else if (values.indexOf(v) >= 0 && selected.indexOf(v) < 0)
        selected.push(v);
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

  public static nbActives(filters: Filters): number {
    let nb = 0;
    if (filters.duration.from !== undefined || filters.duration.to !== undefined) nb++;
    if (filters.estimatedDuration.from !== undefined || filters.estimatedDuration.to !== undefined) nb++;
    if (filters.distance.from !== undefined || filters.distance.to !== undefined) nb++;
    if (filters.positiveElevation.from !== undefined || filters.positiveElevation.to !== undefined) nb++;
    if (filters.negativeElevation.from !== undefined || filters.negativeElevation.to !== undefined) nb++;
    if (filters.loopTypes.selected) nb++;
    if (filters.activities.selected) nb++;
    if (filters.onlyVisibleOnMap) nb++;
    if (filters.tags.type === 'onlyWithAnyTag' || filters.tags.type === 'onlyWithoutAnyTag' || filters.tags.tagsUuids.length !== 0) nb++;
    if (filters.rate.from !== undefined || filters.rate.to !== undefined) nb++;
    return nb;
  }

  public static reset(filters: Filters): void {
    filters.duration = {from: undefined, to: undefined};
    filters.estimatedDuration = {from: undefined, to: undefined};
    filters.positiveElevation = {from: undefined, to: undefined};
    filters.negativeElevation = {from: undefined, to: undefined};
    filters.rate = {from: undefined, to: undefined};
    filters.loopTypes = {selected: undefined};
    filters.activities = {selected: undefined};
    filters.onlyVisibleOnMap = false;
    filters.tags = {tagsUuids: [], type: 'include_and'};
    filters.search = '';
  }

}
