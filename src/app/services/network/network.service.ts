import { Injectable } from '@angular/core';
import { INetworkService } from './network.interface';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClientService } from '../http/http-client.service';
import { HttpMethod, TrailenceHttpRequest } from '../http/http-request';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class NetworkService implements INetworkService {

  private _server$: BehaviorSubject<boolean>;
  private _internet$: BehaviorSubject<boolean>;

  constructor(private http: HttpClientService) {
    this._server$ = new BehaviorSubject<boolean>(false);
    this._internet$ = new BehaviorSubject<boolean>(false);
    this.updateStatus();
    window.addEventListener('online', () => this.updateStatus());
    window.addEventListener('offline', () => this.updateStatus());
    this._server$.subscribe(connected => console.log("Server reachable = " + connected));
    this._internet$.subscribe(connected => console.log("Network connection = " + connected));
  }

  get server(): boolean { return this._server$.value; }
  get server$(): Observable<boolean> { return this._server$; }

  get internet(): boolean { return this._internet$.value; }
  get internet$(): Observable<boolean> { return this._internet$; }

  private count = 0;

  private updateStatus(): void {
    const newStatus = window.navigator.onLine;
    console.log('Network changed (' + newStatus + '), ping server');
    if (!newStatus) {
      if (this._internet$.value) {
        this._internet$.next(false);
      }
    } else if (!this._internet$.value) {
      setTimeout(() => {
        if (window.navigator.onLine && !this._internet$.value) this._internet$.next(true);
      }, 2000);
    }
    const c = ++this.count;
    this.http.send(new TrailenceHttpRequest(HttpMethod.GET, environment.apiBaseUrl + '/ping'))
    .subscribe(response => {
      if (c !== this.count) return;
      let status: boolean;
      if (response.status === 200) {
        console.log('Server ping response received: connected');
        status = true;
      } else {
        console.log('Server ping response error (' + response.status + '): not connected');
        status = false;
      }
      if (status !== this._server$.value) {
        this._server$.next(status);
      }
    });
  }

}
