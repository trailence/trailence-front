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

  private _connected$: BehaviorSubject<boolean>;

  constructor(private http: HttpClientService) {
    this._connected$ = new BehaviorSubject<boolean>(false);
    this.updateStatus();
    window.addEventListener('online', () => this.updateStatus());
    window.addEventListener('offline', () => this.updateStatus());
    this._connected$.subscribe(connected => console.log("Network connected = " + connected));
  }

  get connected(): boolean { return this._connected$.value; }
  get connected$(): Observable<boolean> { return this._connected$; }

  private count = 0;

  private updateStatus(): void {
    console.log('Network changed (' + window.navigator.onLine + '), ping server');
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
      if (status !== this._connected$.value) {
        this._connected$.next(status);
      }
    });
  }

}
