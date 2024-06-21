import { BehaviorSubject, Observable, combineLatest, skip } from 'rxjs';
import { TrailDto } from './dto/trail';
import { Owned } from './owned';

export class Trail extends Owned {

  private _name$: BehaviorSubject<string>;
  private _description$: BehaviorSubject<string>;

  private _originalTrackUuid$: BehaviorSubject<string>;
  private _currentTrackUuid$: BehaviorSubject<string>;

  private _collectionUuid$: BehaviorSubject<string>;

  constructor(
    dto: Partial<TrailDto>
  ) {
    super(dto);
    this._name$ = new BehaviorSubject<string>(dto.name ?? '');
    this._description$ = new BehaviorSubject<string>(dto.description ?? '');
    if (!dto.originalTrackUuid) throw new Error('Missing originalTrackUuid');
    this._originalTrackUuid$ = new BehaviorSubject<string>(dto.originalTrackUuid);
    if (!dto.currentTrackUuid) throw new Error('Missing currentTrackUuid');
    this._currentTrackUuid$ = new BehaviorSubject<string>(dto.currentTrackUuid);
    if (!dto.collectionUuid) throw new Error('Missing collectionUuid');
    this._collectionUuid$ = new BehaviorSubject<string>(dto.collectionUuid);
  }

  public get name(): string { return this._name$.value; }
  public get name$(): Observable<String> { return this._name$; }
  public set name(value: string) { this.setValue(value, this._name$); }

  public get description(): string { return this._description$.value; }
  public get description$(): Observable<string> { return this._description$; }
  public set description(value: string) { this.setValue(value, this._description$); }

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
    return combineLatest([this.name$, this.description$, this.originalTrackUuid$, this.currentTrackUuid$, this.collectionUuid$]).pipe(
      skip(1),
    );
  }

  private setValue(value: string, target$: BehaviorSubject<string>): void {
    if (value === target$.value) return;
    target$.next(value);
  }

  public override toDto(): TrailDto {
    return {
      ...super.toDto(),
      name: this.name,
      description: this.description,
      originalTrackUuid: this.originalTrackUuid,
      currentTrackUuid: this.currentTrackUuid,
      collectionUuid: this.collectionUuid,
    };
  }

}
