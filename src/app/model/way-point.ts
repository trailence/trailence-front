import { BehaviorSubject, Observable } from 'rxjs';
import { Point } from './point';
import { WayPointDto } from './dto/way-point';

export class WayPoint {

  private _point: Point;
  private _name: BehaviorSubject<string>;
  private _description: BehaviorSubject<string>;

  constructor(
    point: Point,
    name: string,
    description: string,
  ) {
    this._point = point;
    this._name = new BehaviorSubject<string>(name);
    this._description = new BehaviorSubject<string>(description);
  }

  public get point(): Point { return this._point; }

  public get name(): string { return this._name.value; }
  public get name$(): Observable<string> { return this._name; }
  public set name(value: string) { if (this._name.value !== value) this._name.next(value); }

  public get description(): string { return this._description.value; }
  public get description$(): Observable<string> { return this._description; }
  public set description(value: string) { if (this._description.value !== value) this._description.next(value); }

  public toDto(): WayPointDto {
    const p = this._point.pos;
    return {
      l: p.lat,
      n: p.lng,
      e: this._point.ele,
      t: this._point.time,
      na: this._name.value,
      de: this._description.value,
    }
  }

}
