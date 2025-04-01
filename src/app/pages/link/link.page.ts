import { Component, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth/auth.service';
import { ApiError } from 'src/app/services/http/api-error';
import { HttpService } from 'src/app/services/http/http.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { environment } from 'src/environments/environment';
import { IonIcon } from "@ionic/angular/standalone";
import { ShareService } from 'src/app/services/database/share.service';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { map } from 'rxjs';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';
import { Console } from 'src/app/utils/console';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-link',
    templateUrl: './link.page.html',
    styleUrls: [],
    imports: [IonIcon, CommonModule]
})
export class LinkPage {

  inprogress = true;
  message = '';

  constructor(
    private readonly router: Router,
    private readonly i18n: I18nService,
    private readonly injector: Injector,
  ) { }

  ionViewDidEnter() {
    let token = window.location.pathname;
    if (!token.startsWith('/link/')) {
      Console.warn('Invalid link', token);
      this.router.navigateByUrl('/');
      return;
    }
    token = decodeURIComponent(token.substring(6));
    const i = token.indexOf('.');
    if (i <= 0) {
      Console.warn('Invalid token', token);
      this.router.navigateByUrl('/');
      return;
    }
    try {
      const json = atob(token.substring(0, i));
      const payload = JSON.parse(json);
      if (!payload) {
        Console.warn('Invalid token payload', token);
        this.router.navigateByUrl('/');
        return;
      }
      Console.info('payload', payload);
      if (payload.type === 'stop_change_password') {
        this.message = this.i18n.texts.pages.link.stop_change_password.in_progress;
        this.injector.get(HttpService).delete(environment.apiBaseUrl + '/user/v1/changePassword?token=' + encodeURIComponent(token)).subscribe(
          () => {
            this.message = this.i18n.texts.pages.link.stop_change_password.done;
            this.inprogress = false;
          }
        );
      } else if (payload.type === 'stop_registration') {
        this.message = this.i18n.texts.pages.link.stop_registration.in_progress;
        this.injector.get(HttpService).delete(environment.apiBaseUrl + '/user/v1/sendRegisterCode?token=' + encodeURIComponent(token)).subscribe(
          () => {
            this.message = this.i18n.texts.pages.link.stop_registration.done;
            this.inprogress = false;
          }
        );
      } else if (payload.type === 'stop_deletion') {
        this.message = this.i18n.texts.pages.link.stop_deletion.in_progress;
        this.injector.get(HttpService).delete(environment.apiBaseUrl + '/user/v1/sendDeletionCode?token=' + encodeURIComponent(token)).subscribe(
          () => {
            this.message = this.i18n.texts.pages.link.stop_deletion.done;
            this.inprogress = false;
          }
        );
      } else if (payload.type === 'share') {
        this.message = this.i18n.texts.pages.link.share.in_progress;
        this.injector.get(AuthService).loginWithShareLink(token).subscribe({
          complete: () => {
            let lang = window.location.search;
            if (lang.startsWith('?lang=')) {
              lang = lang.substring(6);
              Console.info('Switch language from share link to', lang);
              this.injector.get(PreferencesService).setLanguage(lang);
            }
            let i = payload.data.indexOf('/');
            Console.info('Opening share id', payload.data.substring(0, i), 'from', payload.data.substring(i + 1));
            this.injector.get(ShareService).getAll$().pipe(
              collection$items(),
              map(shares => shares.find(share => share.uuid === payload.data.substring(0, i) && share.owner === payload.data.substring(i + 1))),
              firstTimeout(share => !!share, 10000, () => null as any)
            ).subscribe(() => this.router.navigateByUrl('/trails/share/' + payload.data));
          },
          error: error => {
            Console.error(error);
            if (error instanceof ApiError && error.httpCode === 403) {
              this.router.navigateByUrl('/login?email=' + encodeURIComponent(payload.email));
            }
            this.message = this.i18n.texts.pages.link.share.error;
            this.inprogress = false;
          }
        });
      }
    } catch (e) {
      Console.error('Error decoding token', token, e);
      this.router.navigateByUrl('/');
      return;
    }
  }

}
