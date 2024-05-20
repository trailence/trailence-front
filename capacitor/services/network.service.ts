import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { INetworkService } from 'src/app/services/network/network.interface';
import { ConnectionStatus, ConnectionType, Network } from '@capacitor/network';

@Injectable({
  providedIn: 'root'
})
export class NetworkService implements INetworkService {

  private _connected$ = new BehaviorSubject<boolean>(false);

  constructor() {
    this._connected$ = new BehaviorSubject<boolean>(window.navigator.onLine);
    Network.getStatus().then(status => {
      this.networks.set(status.connectionType, status.connected);
      this._connected$.next(status.connected);
    });
    Network.addListener('networkStatusChange', status => {
      console.log('network status changed', status);
      this.updateStatus(status);
    });
  }

  get connected(): boolean { return this._connected$.value; }
  get connected$(): Observable<boolean> { return this._connected$; }

  private timeout?: any;
  private networks = new Map<ConnectionType, boolean>();

  private updateStatus(status: ConnectionStatus): void {
    this.networks.set(status.connectionType, status.connected);
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
    this.timeout = setTimeout(() => {
      this.timeout = undefined;
      let connected = false;
      this.networks.forEach(element => {
        connected ||= element;
      });
      if (connected === this._connected$.value) return;
      console.log('Update network status: connected = ' + connected);
      this._connected$.next(connected);
    }, 2500);
  }

}
