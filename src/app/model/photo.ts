import { BehaviorSubject, Observable } from 'rxjs';
import { PhotoDto } from './dto/photo';
import { Owned } from './owned';
import { PointDtoMapper } from './point-dto-mapper';

export class Photo extends Owned {

  private readonly _trailUuid$: BehaviorSubject<string>;
  private readonly _description$: BehaviorSubject<string>;
  private readonly _dateTaken$: BehaviorSubject<number | undefined>;
  private readonly _latitude$: BehaviorSubject<number | undefined>;
  private readonly _longitude$: BehaviorSubject<number | undefined>;
  private readonly _isCover$: BehaviorSubject<boolean>;
  private readonly _index$: BehaviorSubject<number>;

  constructor(
    dto: Partial<PhotoDto>,
    public readonly fromModeration = false,
    public readonly fromRecording = false,
  ) {
    super(dto);
    if (!dto.trailUuid) throw Error('Missing trail uuid');
    this._trailUuid$ = new BehaviorSubject(dto.trailUuid);
    this._description$ = new BehaviorSubject(dto.description ?? '');
    this._dateTaken$ = new BehaviorSubject(dto.dateTaken);
    this._latitude$ = new BehaviorSubject(dto.latitude === undefined || dto.latitude === null ? undefined : PointDtoMapper.readCoordValue(dto.latitude));
    this._longitude$ = new BehaviorSubject(dto.longitude === undefined || dto.longitude === null ? undefined : PointDtoMapper.readCoordValue(dto.longitude));
    this._isCover$ = new BehaviorSubject(dto.isCover ?? false);
    this._index$ = new BehaviorSubject(dto.index ?? 1);
  }

  public get trailUuid(): string { return this._trailUuid$.value; }
  public get trailUuid$(): Observable<string> { return this._trailUuid$; }
  public set trailUuid(value: string) { this.setValue(value.trim(), this._trailUuid$); }

  public get description(): string { return this._description$.value; }
  public get description$(): Observable<string> { return this._description$; }
  public set description(value: string) { this.setValue(value.trim(), this._description$); }

  public get dateTaken(): number | undefined { return this._dateTaken$.value; }
  public get dateTaken$(): Observable<number | undefined> { return this._dateTaken$; }
  public set dateTaken(value: number | undefined) { this.setValue(value, this._dateTaken$); }

  public get latitude(): number | undefined { return this._latitude$.value; }
  public get latitude$(): Observable<number | undefined> { return this._latitude$; }
  public set latitude(value: number | undefined) { this.setValue(value, this._latitude$); }

  public get longitude(): number | undefined { return this._longitude$.value; }
  public get longitude$(): Observable<number | undefined> { return this._longitude$; }
  public set longitude(value: number | undefined) { this.setValue(value, this._longitude$); }

  public get isCover(): boolean { return this._isCover$.value; }
  public get isCover$(): Observable<boolean> { return this._isCover$; }
  public set isCover(value: boolean) { this.setValue(value, this._isCover$); }

  public get index(): number { return this._index$.value; }
  public get index$(): Observable<number> { return this._index$; }
  public set index(value: number) { this.setValue(value, this._index$); }

  private setValue<T>(value: T, target$: BehaviorSubject<T>): void {
    if (value === target$.value) return;
    target$.next(value);
  }

  public override toDto(): PhotoDto {
    return {
      ...super.toDto(),
      trailUuid: this.trailUuid,
      description: this.description,
      dateTaken: this.dateTaken,
      latitude: this.latitude !== undefined ? PointDtoMapper.writeCoordValue(this.latitude) : undefined,
      longitude: this.longitude !== undefined ? PointDtoMapper.writeCoordValue(this.longitude) : undefined,
      isCover: this.isCover,
      index: this.index
    };
  }

}
