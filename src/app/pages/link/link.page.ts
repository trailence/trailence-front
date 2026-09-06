import { Component, Injector, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@trailence/services/auth/auth.service';
import { ApiError } from '@trailence/services/http/api-error';
import { HttpService } from '@trailence/services/http/http.service';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { PreferencesService } from '@trailence/services/preferences/preferences.service';
import { environment } from '@env/environment';
import { IonIcon } from "@ionic/angular";
import { ShareService } from '@trailence/services/database/share.service';
import { collection$items } from '@trailence/utils/rxjs/collection$items';
import { map } from 'rxjs';
import { firstTimeout } from '@trailence/utils/rxjs/first-timeout';
import { Console } from '@trailence/utils/console';
import { TrailCollectionService } from '@trailence/services/database/trail-collection.service';
import { SHARED_OWNER_PREFIX } from '@trailence/model/dto/trail-collection';

@Component({
    selector: 'app-link',
    templateUrl: './link.page.html',
    styleUrls: [],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [IonIcon]
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
    let token = globalThis.location.pathname;
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
            let lang = globalThis.location.search;
            if (lang.startsWith('?lang=')) {
              lang = lang.substring(6);
              Console.info('Switch language from share link to', lang);
              this.injector.get(PreferencesService).setLanguageIfKnown(lang);
            }
            let i = payload.data.indexOf('/');
            const uuid = payload.data.substring(0, i);
            const owner = payload.data.substring(i + 1);
            if (owner.startsWith(SHARED_OWNER_PREFIX)) {
              Console.info('Opening shared collection id', uuid, 'from', owner);
              this.injector.get(TrailCollectionService).getAllCollectionsReady$().pipe(
                map(collections => collections.find(col => col.uuid === uuid)),
                firstTimeout(col => !!col, 10000, () => null as any)
              ).subscribe(() => this.router.navigateByUrl('/trails/collection/' + uuid));
            } else {
              Console.info('Opening share id', uuid, 'from', owner);
              this.injector.get(ShareService).getAll$().pipe(
                collection$items(),
                map(shares => shares.find(share => share.uuid === uuid && share.owner === owner)),
                firstTimeout(share => !!share, 10000, () => null as any)
              ).subscribe(() => this.router.navigateByUrl('/trails/share/' + payload.data));
            }
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
