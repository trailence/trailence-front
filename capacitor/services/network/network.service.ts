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

  private _connected$ = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpClientService) {
    this._connected$ = new BehaviorSubject<boolean>(false);
    Network.getStatus().then(status => {
      this.updateStatus(status);
    });
    Network.addListener('networkStatusChange', status => {
      console.log('network status changed', status);
      this.updateStatus(status);
    });
  }

  get connected(): boolean { return this._connected$.value; }
  get connected$(): Observable<boolean> { return this._connected$; }

  private networks = new Map<ConnectionType, boolean>();
  private count = 0;

  private updateStatus(status: ConnectionStatus): void {
    this.networks.set(status.connectionType, status.connected);
    console.log('Network changed', this.networks, 'ping server');
    const c = ++this.count;
    this.http.send(new TrailenceHttpRequest(HttpMethod.GET, environment.apiBaseUrl + '/ping'))
    .subscribe(response => {
      if (c != this.count) return;
      let status: boolean;
      if (response.status === 200) {
        console.log('Server ping response received: connected');
        status = true;
      } else {
        console.log('Server ping response error (' + response.status + '): not connected');
        status = false;
      }
      if (status !== this._connected$.value) {
        this._connected$.next(status);
      }
    });
  }

}
