import { Component, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth/auth.service';
import { ApiError } from 'src/app/services/http/api-error';
import { HttpService } from 'src/app/services/http/http.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-link',
  templateUrl: './link.page.html',
  styleUrls: ['./link.page.scss'],
  standalone: true,
  imports: []
})
export class LinkPage {

  message = '';

  constructor(
    private router: Router,
    private i18n: I18nService,
    private injector: Injector,
  ) { }

  ionViewDidEnter() {
    let token = window.location.pathname;
    if (!token.startsWith('/link/')) {
      console.log('Invalid link', token);
      this.router.navigateByUrl('/');
      return;
    }
    token = decodeURIComponent(token.substring(6));
    const i = token.indexOf('.');
    if (i <= 0) {
      console.log('Invalid token', token);
      this.router.navigateByUrl('/');
      return;
    }
    try {
      const json = atob(token.substring(0, i));
      const payload = JSON.parse(json);
      if (!payload) {
        console.log('Invalid token payload', token);
        this.router.navigateByUrl('/');
        return;
      }
      console.log('payload', payload);
      if (payload.type === 'stop_change_password') {
        this.message = this.i18n.texts.pages.link.stop_change_password.in_progress;
        this.injector.get(HttpService).delete(environment.apiBaseUrl + '/user/v1/changePassword?token=' + encodeURIComponent(token)).subscribe(
          () => this.message = this.i18n.texts.pages.link.stop_change_password.done
        );
      } else if (payload.type === 'share') {
        this.message = this.i18n.texts.pages.link.share.in_progress;
        this.injector.get(AuthService).loginWithShareLink(token).subscribe({
          complete: () => {
            let lang = window.location.search;
            if (lang.startsWith('?lang=')) {
              lang = lang.substring(6);
              this.injector.get(PreferencesService).setLanguage(lang);
            }
            this.router.navigateByUrl('/trails/share/' + payload.data);
          },
          error: error => {
            console.log(error);
            if (error instanceof ApiError && error.httpCode === 403) {
              this.router.navigateByUrl('/login?email=' + encodeURIComponent(payload.email));
            }
            this.message = this.i18n.texts.pages.link.share.error;
          }
        });
      }
    } catch (e) {
      console.log('Error decoding token', token, e);
      this.router.navigateByUrl('/');
      return;
    }
  }

}
