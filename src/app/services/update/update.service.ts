import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular/standalone';
import { environment } from 'src/environments/environment';
import { NetworkService } from '../network/network.service';
import { catchError, EMPTY, first, map, Observable, of, switchMap } from 'rxjs';
import { HttpService } from '../http/http.service';
import { trailenceAppVersionCode, trailenceAppVersionName } from 'src/app/trailence-version';

export interface AppDownload {
  url: string;
  icon: string;
  i18nText: string;
}

@Injectable({providedIn: 'root'})
export class UpdateService {

  public versionName = trailenceAppVersionName;
  public versionCode = trailenceAppVersionCode;

  public downloadApp?: AppDownload;
  public updateApp?: AppDownload;

  constructor(
    private platform: Platform,
    private network: NetworkService,
    private http: HttpService,
  ) {
    this.downloadApp = this.getDownload();
    if (platform.is('capacitor')) {
      this.network.server$.pipe(
        switchMap(connected => !connected ? EMPTY : this.checkUpdate()),
        first(),
      ).subscribe(url => this.updateApp = url || undefined);
    }
  }

  private getDownload(): AppDownload | undefined {
    if (!this.platform.is('mobileweb') || this.platform.is('capacitor')) return undefined;
    if (this.platform.is('android'))
      return {
        url: this.apkUrl(),
        icon: this.apkIcon(),
        i18nText: this.apkDownloadText(),
      };
    return undefined;
  }

  private checkUpdate(): Observable<AppDownload | null> {
    if (this.platform.is('android')) return this.checkUpdateApk();
    return of(null);
  }

  private checkUpdateApk(): Observable<AppDownload | null> {
    return this.http.get(environment.baseUrl + '/assets/apk/metadata.json').pipe(
      map((metadata: any) => {
        if (metadata.elements && metadata.elements[0].versionCode && metadata.elements[0].versionCode > this.versionCode) {
          return {
            url: this.apkUrl(),
            icon: this.apkIcon(),
            i18nText: this.apkUpdateText(),
          };
        }
        return null;
      }),
      catchError(() => EMPTY)
    );
  }

  private apkUrl(): string {
    return environment.baseUrl + '/assets/apk/trailence.apk';
  }

  private apkIcon(): string {
    return 'android';
  }

  private apkDownloadText(): string {
    return 'download_android';
  }

  private apkUpdateText(): string {
    return 'update_android';
  }

  public download(): void {
    const app = this.downloadApp || this.updateApp;
    if (!app) return;
    window.open(app.url, '_blank');
  }

}
