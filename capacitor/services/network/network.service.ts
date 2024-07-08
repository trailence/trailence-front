import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { INetworkService } from 'src/app/services/network/network.interface';
import { ConnectionStatus, ConnectionType, Network } from '@capacitor/network';
import { HttpClientService } from 'src/app/services/http/http-client.service';
import { HttpMethod, TrailenceHttpRequest } from 'src/app/services/http/http-request';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class NetworkService implements INetworkService {

  private _server$ = new BehaviorSubject<boolean>(false);
  private _internet$ = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpClientService) {
    this._server$ = new BehaviorSubject<boolean>(false);
    this._internet$ = new BehaviorSubject<boolean>(false);
    Network.getStatus().then(status => {
      this.updateStatus(status);
    });
    Network.addListener('networkStatusChange', status => {
      console.log('network status changed', status);
      this.updateStatus(status);
    });
  }

  get server(): boolean { return this._server$.value; }
  get server$(): Observable<boolean> { return this._server$; }

  get internet(): boolean { return this._internet$.value; }
  get internet$(): Observable<boolean> { return this._internet$; }

  private countPing = 0;
  private countNet = 0;

  private updateStatus(status: ConnectionStatus): void {
    console.log('Network changed', status, 'ping server');
    const c = ++this.countPing;
    this.http.send(new TrailenceHttpRequest(HttpMethod.GET, environment.apiBaseUrl + '/ping'))
    .subscribe(response => {
      if (c != this.countPing) return;
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
    const c2 = ++this.countNet;
    setTimeout(() => {
      if (c2 === this.countNet && status.connected !== this._internet$.value) {
        this._internet$.next(status.connected);
      }
    }, 2500);
  }

}
