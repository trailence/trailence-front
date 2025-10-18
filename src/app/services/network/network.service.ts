import { Injectable, OnDestroy } from '@angular/core';
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
export class NetworkService implements INetworkService, OnDestroy {

  private readonly _server$: BehaviorSubject<boolean>;
  private readonly _internet$: BehaviorSubject<boolean>;
  private destroyed = false;

  constructor(private readonly http: HttpClientService, httpService: HttpService) {
    this._server$ = new BehaviorSubject<boolean>(false);
    this._internet$ = new BehaviorSubject<boolean>(false);
    this.updateStatus(true);
    globalThis.addEventListener('online', () => this.updateStatus(false));
    globalThis.addEventListener('offline', () => this.updateStatus(false));
    if ((globalThis as any).navigator.connection) {
      (globalThis as any).navigator.connection.addEventListener('change', () => this.updateStatus(false));
    }
    this._server$.subscribe(connected => Console.info("Server reachable = " + connected));
    this._internet$.subscribe(connected => Console.info("Network connection = " + connected));
    httpService.addResponseInterceptor(response => {
      if (response.status === 0 && response.request.url.startsWith(environment.apiBaseUrl)) {
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
    const newStatus = globalThis.navigator.onLine;
    Console.info('Network changed (' + newStatus + '), ping server');
    if (!newStatus) {
      if (this._internet$.value) {
        this._internet$.next(false);
      }
    } else if (!this._internet$.value) { // NOSONAR
      if (firstCall) {
        this.checkInternet().then(connected => { if (connected) this._internet$.next(true); })
      }
      else setTimeout(() => {
        if (globalThis.navigator.onLine && !this._internet$.value)
          this.checkInternet().then(connected => { if (connected) this._internet$.next(true); })
      }, 1000);
    } else {
      this.checkInternet().then(connected => { if (!connected) this._internet$.next(false); })
    }
    this.checkServerConnection(++this.count, 1);
  }

  private checkInternet(): Promise<boolean> {
    return globalThis.fetch('https://www.google.com', {mode: 'no-cors'})
    .then(() => true)
    .catch(() => false);
  }

  private checkServerConnection(count: number, trial: number): void {
    if (count !== this.count || this.destroyed) return;
    const start = Date.now();
    this.http.send(new TrailenceHttpRequest(HttpMethod.GET, environment.apiBaseUrl + '/ping'))
    .subscribe(response => {
      if (count !== this.count || this.destroyed) return;
      let status: boolean;
      if (response.status === 200) {
        Console.info('Server ping response received: connected (' + (Date.now() - start) + 'ms.)', response.body);
        status = true;
      } else {
        Console.info('Server ping response error (' + response.status + '): not connected');
        status = false;
        if (trial < 3) setTimeout(() => this.checkServerConnection(count, trial + 1), trial * 250);
        else if (trial < 10) setTimeout(() => this.checkServerConnection(count, trial + 1), 1000);
        else if (trial < 15) setTimeout(() => this.checkServerConnection(count, trial + 1), 15000);
        else if (trial < 20) setTimeout(() => this.checkServerConnection(count, trial + 1), 60000);
        else setTimeout(() => this.checkServerConnection(count, trial + 1), 5 * 60000);
      }
      if (status !== this._server$.value) {
        this._server$.next(status);
      }
    });
  }

}
