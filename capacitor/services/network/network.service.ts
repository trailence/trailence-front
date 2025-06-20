import { Injectable, Injector } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { INetworkService, PingResponse } from 'src/app/services/network/network.interface';
import { ConnectionStatus, Network } from '@capacitor/network';
import { HttpClientService } from 'src/app/services/http/http-client.service';
import { HttpMethod, TrailenceHttpRequest } from 'src/app/services/http/http-request';
import { environment } from 'src/environments/environment';
import { Console } from 'src/app/utils/console';
import { HttpService } from 'src/app/services/http/http.service';
import { StringUtils } from 'src/app/utils/string-utils';
import { trailenceAppVersionCode } from 'src/app/trailence-version';
import { AlertController } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Injectable({
  providedIn: 'root'
})
export class NetworkService implements INetworkService {

  private readonly _server$ = new BehaviorSubject<boolean>(false);
  private readonly _internet$ = new BehaviorSubject<boolean>(false);

  constructor(
    private readonly http: HttpClientService,
    httpService: HttpService,
    private readonly injector: Injector,
  ) {
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
        if (this._server$.value)
          setTimeout(() => {
            if (this._server$.value) {
              this._server$.next(false);
              setTimeout(() => this.checkServerConnection(++this.countPing, 1), 1000);
            }
          }, 0);
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
    if (count !== this.countPing) return;
    this.http.send(new TrailenceHttpRequest(HttpMethod.GET, environment.apiBaseUrl + '/ping'))
    .subscribe(response => {
      if (count !== this.countPing) return;
      let status: boolean;
      if (response.status === 200) {
        Console.info('Server ping response received: connected on ' + environment.apiBaseUrl);
        const ping = response.body as PingResponse;
        const minSupportedVersion = StringUtils.versionNameToVersionCode(ping.minSupportedVersion);
        if (minSupportedVersion === undefined || minSupportedVersion > trailenceAppVersionCode) {
          Console.info("We are on an obselete version ! please update");
          status = false;
          const i18n = this.injector.get(I18nService);
          this.injector.get(AlertController).create({
            header: i18n.texts.obsolete_message.title,
            message: i18n.texts.obsolete_message.message,
            buttons: [{
              text: i18n.texts.buttons.understood,
              role: 'cancel'
            }]
          }).then(a => a.present());
        } else {
          status = true;
        }
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
