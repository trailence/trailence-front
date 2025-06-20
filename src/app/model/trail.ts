import { BehaviorSubject, Observable, combineLatest, skip } from 'rxjs';
import { TrailDto } from './dto/trail';
import { Owned } from './owned';
import { TypeUtils } from '../utils/type-utils';

export class Trail extends Owned {

  private readonly _name$: BehaviorSubject<string>;
  private readonly _description$: BehaviorSubject<string>;
  private readonly _location$: BehaviorSubject<string>;
  private readonly _date$: BehaviorSubject<number | undefined>;
  private readonly _loopType$: BehaviorSubject<TrailLoopType | undefined>;
  private readonly _activity$: BehaviorSubject<TrailActivity | undefined>;

  private readonly _originalTrackUuid$: BehaviorSubject<string>;
  private readonly _currentTrackUuid$: BehaviorSubject<string>;

  private readonly _collectionUuid$: BehaviorSubject<string>;

  public readonly sourceType?: string;
  public readonly source?: string;
  public readonly sourceDate?: number;

  constructor(
    dto: Partial<TrailDto>
  ) {
    super(dto);
    this._name$ = new BehaviorSubject<string>(dto.name ?? '');
    this._description$ = new BehaviorSubject<string>(dto.description ?? '');
    this._location$ = new BehaviorSubject<string>(dto.location ?? '');
    this._date$ = new BehaviorSubject<number | undefined>(dto.date);
    this._loopType$ = new BehaviorSubject<TrailLoopType | undefined>(TypeUtils.valueToEnum(dto.loopType, TrailLoopType));
    this._activity$ = new BehaviorSubject<TrailActivity | undefined>(TypeUtils.valueToEnum(dto.activity, TrailActivity));
    if (!dto.originalTrackUuid) throw new Error('Missing originalTrackUuid');
    this._originalTrackUuid$ = new BehaviorSubject<string>(dto.originalTrackUuid);
    if (!dto.currentTrackUuid) throw new Error('Missing currentTrackUuid');
    this._currentTrackUuid$ = new BehaviorSubject<string>(dto.currentTrackUuid);
    if (!dto.collectionUuid) throw new Error('Missing collectionUuid');
    this._collectionUuid$ = new BehaviorSubject<string>(dto.collectionUuid);
    this.sourceType = dto.sourceType ?? undefined;
    this.source = (dto.source ? (dto.source.length < 2000 ? dto.source : dto.source.substring(0, 2000)) : undefined);
    this.sourceDate = dto.sourceDate ?? undefined;
  }

  public get name(): string { return this._name$.value; }
  public get name$(): Observable<string> { return this._name$; }
  public set name(value: string) { this.setValue(value.trim(), this._name$); }

  public get description(): string { return this._description$.value; }
  public get description$(): Observable<string> { return this._description$; }
  public set description(value: string) { this.setValue(value.trim(), this._description$); }

  public get location(): string { return this._location$.value; }
  public get location$(): Observable<string> { return this._location$; }
  public set location(value: string) { this.setValue(value.trim(), this._location$); }

  public get date(): number | undefined { return this._date$.value; }
  public get date$(): Observable<number | undefined> { return this._date$; }
  public set date(value: number) { this.setValue(value, this._date$); }

  public get loopType(): TrailLoopType | undefined { return this._loopType$.value; }
  public get loopType$(): Observable<TrailLoopType | undefined> { return this._loopType$; }
  public set loopType(value: TrailLoopType | undefined) { this.setValue(value, this._loopType$); }

  public get activity(): TrailActivity | undefined { return this._activity$.value; }
  public get activity$(): Observable<TrailActivity | undefined> { return this._activity$; }
  public set activity(value: TrailActivity | undefined) { this.setValue(value, this._activity$); }

  public get originalTrackUuid(): string { return this._originalTrackUuid$.value; }
  public get originalTrackUuid$(): Observable<string> { return this._originalTrackUuid$; }
  public set originalTrackUuid(value: string) { this.setValue(value, this._originalTrackUuid$); }

  public get currentTrackUuid(): string { return this._currentTrackUuid$.value; }
  public get currentTrackUuid$(): Observable<string> { return this._currentTrackUuid$; }
  public set currentTrackUuid(value: string) { this.setValue(value, this._currentTrackUuid$); }

  public get collectionUuid(): string { return this._collectionUuid$.value; }
  public get collectionUuid$(): Observable<string> { return this._collectionUuid$; }
  public set collectionUuid(value: string) { this.setValue(value, this._collectionUuid$); }

  public get changes$(): Observable<any> {
    return combineLatest([this.name$, this.description$, this.location$, this.date$, this.loopType$, this.activity$, this.originalTrackUuid$, this.currentTrackUuid$, this.collectionUuid$]).pipe(
      skip(1),
    );
  }

  private setValue<T>(value: T, target$: BehaviorSubject<T>): void {
    if (value === target$.value) return;
    target$.next(value);
  }

  public override toDto(): TrailDto {
    return {
      ...super.toDto(),
      name: this.name,
      description: this.description,
      location: this.location,
      date: this.date,
      loopType: this.loopType,
      activity: this.activity,
      sourceType: this.sourceType,
      source: this.source,
      originalTrackUuid: this.originalTrackUuid,
      currentTrackUuid: this.currentTrackUuid,
      collectionUuid: this.collectionUuid,
    };
  }

}

export enum TrailLoopType {
  ONE_WAY = 'ow',
  LOOP = 'lp',
  HALF_LOOP = 'hl',
  SMALL_LOOP = 'sl',
  OUT_AND_BACK = 'ob',
}

export enum TrailActivity {
  WALKING = 'walking',
  HIKING = 'hiking',
  RUNNING = 'running',
  MOUNTAIN_BIKING = 'moutain-biking',
  ROAD_BIKING = 'road-biking',
  HORSEBACK_RIDING = 'horseback-riding',
  SKIING = 'skiing',
  SNOWSHOEING = 'snowshoeing',
  ON_WATER = 'on-water',
  VIA_FERRATA = 'via-ferrata',
  ROCK_CLIMBING = 'rock-climbing',
}
