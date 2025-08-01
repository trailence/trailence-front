import { BehaviorSubject } from 'rxjs';
import { TrailActivity } from 'src/app/model/trail';
import { Arrays } from 'src/app/utils/arrays';
import { Console } from 'src/app/utils/console';

export class StatsConfig {

  public readonly config$: BehaviorSubject<StatsConfig>;

  private _value: StatsValue;
  private _source: StatsSource;
  private _timeUnit: StatsTimeUnit;
  private _activityFilter: (TrailActivity | undefined)[];

  constructor(
    private readonly email: string,
    dto: Partial<StatsConfigDto>
  ) {
    if (dto.value && Object.values(StatsValue).includes(dto.value))
      this._value = dto.value;
    else
      this._value = defaultConfig.value;
    if (dto.source) {
      this._source = dto.source;
    } else {
      this._source = defaultConfig.source;
    }
    if (dto.timeUnit && Object.values(StatsTimeUnit).includes(dto.timeUnit)) {
      this._timeUnit = dto.timeUnit;
    } else {
      this._timeUnit = defaultConfig.timeUnit;
    }
    if (dto.activityFilter && Array.isArray(dto.activityFilter)) {
      this._activityFilter = dto.activityFilter.filter(i => i === undefined || Object.values(TrailActivity).includes(i));
    } else {
      this._activityFilter = [];
    }

    this.config$ = new BehaviorSubject<StatsConfig>(this);

    this.config$.subscribe(cfg => {
      localStorage.setItem(STATS_CONFIG_LOCAL_STORAGE_KEY_PREFIX + this.email, JSON.stringify(this.toDto()));
    });
  }

  public get value() { return this._value; }
  public set value(v: StatsValue) {
    if (this._value === v) return;
    this._value = v;
    this.changed();
  }

  public get source() { return this._source; }
  public set source(v: StatsSource) {
    if (this._source === v) return;
    this._source = v;
    this.changed();
  }

  public get timeUnit() { return this._timeUnit; }
  public set timeUnit(v: StatsTimeUnit) {
    if (this._timeUnit === v) return;
    this._timeUnit = v;
    this.changed();
  }

  public get activities() { return this._activityFilter; }
  public set activities(v: (TrailActivity | undefined)[]) {
    if (Arrays.sameContent(v, this._activityFilter)) return;
    this._activityFilter = v;
    this.changed();
  }

  private changed(): void {
    this.config$.next(this);
  }

  public static load(email: string): StatsConfig {
    const key = STATS_CONFIG_LOCAL_STORAGE_KEY_PREFIX + email;
    const str = localStorage.getItem(key);
    if (str) {
      try {
        const json = JSON.parse(str);
        return new StatsConfig(email, json);
      } catch (e) {
        Console.warn('Invalid stats config', e);
      }
    }
    return new StatsConfig(email, defaultConfig);
  }

  private toDto(): StatsConfigDto {
    return {
      value: this._value,
      source: this._source,
      timeUnit: this._timeUnit,
      activityFilter: this._activityFilter,
    };
  }

}

export enum StatsValue {
  NB_TRAILS = 'nb_trails',
  DISTANCE = 'distance',
  POSITIVE_ELEVATION = 'positive-elevation',
  NEGATIVE_ELEVATION = 'negative-elevation',
  DURATION = 'duration',
}

export type StatsSourceCollections = string[];

export type StatsSource = StatsSourceCollections; // NOSONAR

export enum StatsTimeUnit {
  YEAR = 'year',
  MONTH = 'month',
  MONTH_OF_YEAR = 'month_of_year',
}

const STATS_CONFIG_LOCAL_STORAGE_KEY_PREFIX = 'trailence.stats.';

interface StatsConfigDto {
  value: StatsValue;
  source: StatsSource;
  timeUnit: StatsTimeUnit;
  activityFilter: (TrailActivity | undefined)[];
}

const defaultConfig: StatsConfigDto = {
  value: StatsValue.NB_TRAILS,
  source: ['my_trails'],
  timeUnit: StatsTimeUnit.YEAR,
  activityFilter: [],
};
