import { BehaviorSubject, Observable, combineLatest, skip } from 'rxjs';
import { PointDtoMapper } from './point-dto-mapper';
import { copyPoint, PointDescriptor, pointsAreEqual } from './point-descriptor';
import { WayPointDto } from './dto/way-point';
import { ObjectUtils } from '../utils/object-utils';

export class WayPoint {

  private readonly _point: PointDescriptor;
  private readonly _name: BehaviorSubject<string>;
  private readonly _description: BehaviorSubject<string>;
  private readonly _nameTranslations: BehaviorSubject<{[lang: string]: string} | undefined>;
  private readonly _descriptionTranslations: BehaviorSubject<{[lang: string]: string} | undefined>;

  constructor(
    point: PointDescriptor,
    name: string,
    description: string,
    nameTranslations?: {[lang: string]: string},
    descriptionTranslations?: {[lang: string]: string},
  ) {
    this._point = point;
    this._name = new BehaviorSubject<string>(name);
    this._description = new BehaviorSubject<string>(description);
    this._nameTranslations = new BehaviorSubject(nameTranslations ? {...nameTranslations} : undefined);
    this._descriptionTranslations = new BehaviorSubject(descriptionTranslations ? {...descriptionTranslations} : undefined);
  }

  public get point(): PointDescriptor { return this._point; }

  public get name(): string { return this._name.value; }
  public get name$(): Observable<string> { return this._name; }
  public set name(value: string) { if (this._name.value !== value) this._name.next(value); }

  public get description(): string { return this._description.value; }
  public get description$(): Observable<string> { return this._description; }
  public set description(value: string) { if (this._description.value !== value) this._description.next(value); }

  public get nameTranslations(): {[lang: string]: string} | undefined { return this._nameTranslations.value; }
  public get nameTranslations$(): Observable<{[lang: string]: string} | undefined> { return this._nameTranslations; }
  public set nameTranslations(value: {[lang: string]: string} | undefined) { if (!ObjectUtils.sameContent(this._nameTranslations.value, value)) this._nameTranslations.next(value ? {...value} : undefined); }

  public get descriptionTranslations(): {[lang: string]: string} | undefined { return this._descriptionTranslations.value; }
  public get descriptionTranslations$(): Observable<{[lang: string]: string} | undefined> { return this._descriptionTranslations; }
  public set descriptionTranslations(value: {[lang: string]: string} | undefined) { if (!ObjectUtils.sameContent(this._descriptionTranslations.value, value)) this._descriptionTranslations.next(value ? {...value} : undefined); }

  public get changes$(): Observable<any> {
    return combineLatest([this.name$, this.description$, this.nameTranslations$, this.descriptionTranslations$]).pipe(
      skip(1)
    );
  }

  public toDto(): WayPointDto {
    const p = this._point.pos;
    return {
      l: PointDtoMapper.writeCoordValue(p.lat),
      n: PointDtoMapper.writeCoordValue(p.lng),
      e: this._point.ele !== undefined ? PointDtoMapper.writeElevationValue(this._point.ele) : undefined,
      t: this._point.time,
      na: this._name.value,
      de: this._description.value,
      nt: this._nameTranslations.value,
      dt: this._descriptionTranslations.value,
    }
  }

  public copy(): WayPoint {
    return new WayPoint(copyPoint(this.point), this.name, this.description, this.nameTranslations, this.descriptionTranslations);
  }

  public isEquals(other: WayPoint): boolean {
    return this._name.value === other._name.value &&
      this._description.value === other._description.value &&
      pointsAreEqual(this._point, other._point) &&
      ObjectUtils.sameContent(this._nameTranslations.value, other._nameTranslations.value) &&
      ObjectUtils.sameContent(this._descriptionTranslations.value, other._descriptionTranslations.value);
  }

}
