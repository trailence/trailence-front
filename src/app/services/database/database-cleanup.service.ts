import { Injectable } from '@angular/core';
import { Observable, zip } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DatabaseCleanupService {

  private _canStart: number = 0;
  private _callbacks: (() => Observable<any>)[] = [];

  public register(canStart: Observable<any>, callback: () => Observable<any>): void {
    this._callbacks.push(callback);
    this._canStart += 2;
    canStart.subscribe(() => {
      if (--this._canStart === this._callbacks.length) {
        this.cleanup();
      }
    });
  }

  public unregister(callback: () => Observable<any>): void {
    const index = this._callbacks.indexOf(callback);
    if (index >= 0) {
      this._callbacks.splice(index, 1);
      this._canStart--;
    }
  }

  private cleanup(): void {
    const callbacks = [...this._callbacks];
    this._canStart = 0;
    this._callbacks = [];
    console.log('Database cleanup (' + callbacks.length + ')');
    zip(callbacks.map(cb => cb())).subscribe(() => console.log('Database cleanup done'));
  }

}
