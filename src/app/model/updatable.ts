import { BehaviorSubject, Observable } from 'rxjs';

export class Updatable {

  private _updated = new BehaviorSubject<boolean>(false);

  constructor(
    fields?: Partial<Updatable>
  ) {
    if (fields?.updated)
      this._updated.next(true);
  }

  public get updated(): boolean { return this._updated.value }
  public get updated$(): Observable<boolean> { return this._updated; }

  public set updated(value: boolean) {
    if (value !== this._updated.value) {
      this._updated.next(value);
    }
  }

}
