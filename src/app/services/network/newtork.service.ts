import { Injectable } from '@angular/core';
import { INetworkService } from './network.interface';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class NetworkService implements INetworkService {

  private _connected$: BehaviorSubject<boolean>;

  constructor() {
    this._connected$ = new BehaviorSubject<boolean>(window.navigator.onLine);
    window.addEventListener('online', () => this.updateStatus());
    window.addEventListener('offline', () => this.updateStatus());
    this._connected$.subscribe(connected => console.log("Network connected = " + connected));
  }

  get connected(): boolean { return this._connected$.value; }
  get connected$(): Observable<boolean> { return this._connected$; }

  private timeout?: any;

  private updateStatus(): void {
    const newStatus = window.navigator.onLine;
    if (newStatus === this._connected$.value) {
      return;
    }
    // wait 2 seconds to be sure
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    this.timeout = setTimeout(() => {
      this.timeout = undefined;
      if (window.navigator.onLine !== newStatus) {
        // changed again
        this.updateStatus();
      } else if (newStatus !== this._connected$.value) {
        this._connected$.next(newStatus);
      }
    }, 2000);
  }

}
