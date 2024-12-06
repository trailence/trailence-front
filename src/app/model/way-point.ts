import { BehaviorSubject, Observable, combineLatest, skip } from 'rxjs';
import { copyPoint, PointDescriptor, PointDtoMapper, pointsAreEqual } from './point';
import { WayPointDto } from './dto/way-point';

export class WayPoint {

  private readonly _point: PointDescriptor;
  private readonly _name: BehaviorSubject<string>;
  private readonly _description: BehaviorSubject<string>;

  constructor(
    point: PointDescriptor,
    name: string,
    description: string,
  ) {
    this._point = point;
    this._name = new BehaviorSubject<string>(name);
    this._description = new BehaviorSubject<string>(description);
  }

  public get point(): PointDescriptor { return this._point; }

  public get name(): string { return this._name.value; }
  public get name$(): Observable<string> { return this._name; }
  public set name(value: string) { if (this._name.value !== value) this._name.next(value); }

  public get description(): string { return this._description.value; }
  public get description$(): Observable<string> { return this._description; }
  public set description(value: string) { if (this._description.value !== value) this._description.next(value); }

  public get changes$(): Observable<any> {
    return combineLatest([this.name$, this.description$]).pipe(
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
    }
  }

  public copy(): WayPoint {
    return new WayPoint(copyPoint(this.point), this.name, this.description);
  }

  public isEquals(other: WayPoint): boolean {
    return this._name.value === other._name.value && this._description.value === other._description.value && pointsAreEqual(this._point, other._point);
  }

}
