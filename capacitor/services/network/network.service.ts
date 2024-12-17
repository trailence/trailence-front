import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { INetworkService } from 'src/app/services/network/network.interface';
import { ConnectionStatus, ConnectionType, Network } from '@capacitor/network';
import { HttpClientService } from 'src/app/services/http/http-client.service';
import { HttpMethod, TrailenceHttpRequest } from 'src/app/services/http/http-request';
import { environment } from 'src/environments/environment';
import { Console } from 'src/app/utils/console';
import { HttpService } from 'src/app/services/http/http.service';

@Injectable({
  providedIn: 'root'
})
export class NetworkService implements INetworkService {

  private _server$ = new BehaviorSubject<boolean>(false);
  private _internet$ = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpClientService, httpService: HttpService) {
    this._server$ = new BehaviorSubject<boolean>(false);
    this._internet$ = new BehaviorSubject<boolean>(false);
    Network.getStatus().then(status => {
      this.updateStatus(status);
    });
    Network.addListener('networkStatusChange', status => {
      Console.info('network status changed', status);
      this.updateStatus(status);
    });
    httpService.addResponseInterceptor(response => {
      if (response.status === 0) {
        if (this._server$.value) {
          this._server$.next(false);
          this.checkServerConnection(++this.countPing, 1);
        }
      }
      return response;
    });
  }

  get server(): boolean { return this._server$.value; }
  get server$(): Observable<boolean> { return this._server$; }

  get internet(): boolean { return this._internet$.value; }
  get internet$(): Observable<boolean> { return this._internet$; }

  private countPing = 0;
  private countNet = 0;

  private updateStatus(status: ConnectionStatus): void {
    Console.info('Network changed', status, 'ping server');
    this.checkServerConnection(++this.countPing, 1);
    const c2 = ++this.countNet;
    setTimeout(() => {
      if (c2 === this.countNet && status.connected !== this._internet$.value) {
        this._internet$.next(status.connected);
      }
    }, 1000);
  }

  private checkServerConnection(count: number, trial: number): void {
    this.http.send(new TrailenceHttpRequest(HttpMethod.GET, environment.apiBaseUrl + '/ping'))
    .subscribe(response => {
      if (count !== this.countPing) return;
      let status: boolean;
      if (response.status === 200) {
        Console.info('Server ping response received: connected');
        status = true;
      } else {
        Console.info('Server ping response error (' + response.status + '): not connected');
        status = false;
        if (trial < 3) setTimeout(() => this.checkServerConnection(count, trial + 1), 500);
        else if (trial < 10) setTimeout(() => this.checkServerConnection(count, trial + 1), 1000);
        else if (trial < 20) setTimeout(() => this.checkServerConnection(count, trial + 1), 5000);
        else if (trial < 30) setTimeout(() => this.checkServerConnection(count, trial + 1), 15000);
        else setTimeout(() => this.checkServerConnection(count, trial + 1), 60000);
      }
      if (status !== this._server$.value) {
        this._server$.next(status);
      }
    });
  }

}
