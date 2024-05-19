import { BehaviorSubject, Observable } from 'rxjs';
import * as L from 'leaflet';

export class Point {

  private _lat: BehaviorSubject<number>;
  private _lng: BehaviorSubject<number>;
  private _ele: BehaviorSubject<number | undefined>;
  private _time: BehaviorSubject<number | undefined>;

  constructor(
    lat: number,
    lng: number,
    ele?: number,
    time?: number,
  ) {
    this._lat = new BehaviorSubject<number>(lat);
    this._lng = new BehaviorSubject<number>(lng);
    this._ele = new BehaviorSubject<number | undefined>(ele);
    this._time = new BehaviorSubject<number | undefined>(time);
  }

  public get lat(): number { return this._lat.value; }
  public get lat$(): Observable<number> { return this._lat; }

  public get lng(): number { return this._lng.value; }
  public get lng$(): Observable<number> { return this._lng; }

  public get ele(): number | undefined { return this._ele.value; }
  public get ele$(): Observable<number | undefined> { return this._ele; }

  public get time(): number | undefined { return this._time.value; }
  public get time$(): Observable<number | undefined> { return this._time; }

  public distanceTo(other: L.LatLngExpression): number {
    return L.CRS.Earth.distance(this, other);
  }

}
