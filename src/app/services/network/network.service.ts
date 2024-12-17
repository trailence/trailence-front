import { Injectable } from '@angular/core';
import { INetworkService } from './network.interface';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClientService } from '../http/http-client.service';
import { HttpMethod, TrailenceHttpRequest } from '../http/http-request';
import { environment } from 'src/environments/environment';
import { Console } from 'src/app/utils/console';
import { HttpService } from '../http/http.service';

@Injectable({
  providedIn: 'root'
})
export class NetworkService implements INetworkService {

  private readonly _server$: BehaviorSubject<boolean>;
  private readonly _internet$: BehaviorSubject<boolean>;
  private destroyed = false;

  constructor(private readonly http: HttpClientService, httpService: HttpService) {
    this._server$ = new BehaviorSubject<boolean>(false);
    this._internet$ = new BehaviorSubject<boolean>(false);
    this.updateStatus(true);
    window.addEventListener('online', () => this.updateStatus(false));
    window.addEventListener('offline', () => this.updateStatus(false));
    this._server$.subscribe(connected => Console.info("Server reachable = " + connected));
    this._internet$.subscribe(connected => Console.info("Network connection = " + connected));
    httpService.addResponseInterceptor(response => {
      if (response.status === 0) {
        if (this._server$.value) {
          this._server$.next(false);
          this.checkServerConnection(++this.count, 1);
        }
      }
      return response;
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }

  get server(): boolean { return this._server$.value; }
  get server$(): Observable<boolean> { return this._server$; }

  get internet(): boolean { return this._internet$.value; }
  get internet$(): Observable<boolean> { return this._internet$; }

  private count = 0;

  private updateStatus(firstCall: boolean): void {
    if (this.destroyed) return;
    const newStatus = window.navigator.onLine;
    Console.info('Network changed (' + newStatus + '), ping server');
    if (!newStatus) {
      if (this._internet$.value) {
        this._internet$.next(false);
      }
    } else if (!this._internet$.value) {
      if (firstCall) this._internet$.next(true);
      else setTimeout(() => {
        if (window.navigator.onLine && !this._internet$.value) this._internet$.next(true);
      }, 1000);
    }
    this.checkServerConnection(++this.count, 1);
  }

  private checkServerConnection(count: number, trial: number): void {
    const start = Date.now();
    this.http.send(new TrailenceHttpRequest(HttpMethod.GET, environment.apiBaseUrl + '/ping'))
    .subscribe(response => {
      if (count !== this.count || this.destroyed) return;
      let status: boolean;
      if (response.status === 200) {
        Console.info('Server ping response received: connected (' + (Date.now() - start) + 'ms.)');
        status = true;
      } else {
        Console.info('Server ping response error (' + response.status + '): not connected');
        status = false;
        if (trial < 3) setTimeout(() => this.checkServerConnection(count, trial + 1), 500);
        else if (trial < 10) setTimeout(() => this.checkServerConnection(count, trial + 1), 1000);
        else if (trial < 20) setTimeout(() => this.checkServerConnection(count, trial + 1), 15000);
        else if (trial < 30) setTimeout(() => this.checkServerConnection(count, trial + 1), 30000);
        else setTimeout(() => this.checkServerConnection(count, trial + 1), 60000);
      }
      if (status !== this._server$.value) {
        this._server$.next(status);
      }
    });
  }

}
