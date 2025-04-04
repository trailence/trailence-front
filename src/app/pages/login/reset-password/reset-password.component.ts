import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonLabel, IonContent, IonButtons, IonFooter, IonButton, ModalController, IonInput } from "@ionic/angular/standalone";
import { CodeInputModule } from 'angular-code-input';
import { CaptchaService } from 'src/app/services/captcha/captcha.service';
import { ApiError } from 'src/app/services/http/api-error';
import { HttpService } from 'src/app/services/http/http.service';
import { I18nPipe } from 'src/app/services/i18n/i18n-string';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { ErrorService } from 'src/app/services/progress/error.service';
import { Console } from 'src/app/utils/console';
import { environment } from 'src/environments/environment';

@Component({
    selector: 'app-reset-password',
    templateUrl: './reset-password.component.html',
    styleUrls: ['./reset-password.component.scss'],
    imports: [IonInput, IonButton, IonFooter, IonButtons, IonContent, IonLabel, IonTitle, IonToolbar, IonHeader, CommonModule, FormsModule, CodeInputModule, I18nPipe]
})
export class ResetPasswordComponent implements OnInit {

  @Input() email = '';

  page = 1;
  newPassword1 = '';
  newPassword2  ='';
  captchaToken?: string;
  code = '';
  changeResult: any = undefined;

  passwordsDontMatch = false;
  pending = false;
  sendMailError?: string;

  constructor(
    public i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly http: HttpService,
    private readonly captchaService: CaptchaService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly prefService: PreferencesService,
    private readonly errorService: ErrorService,
  ) {
  }

  ngOnInit(): void {
    this.initCaptcha();
  }

  private initCaptcha(): void {
    setTimeout(() => {
      this.captchaService.displayOn('captcha-forgot-password', token => {
        this.captchaToken = token;
        this.changeDetector.detectChanges();
      },
      () => {
        this.captchaToken = undefined;
        this.changeDetector.detectChanges();
      },
      error => {
        Console.error('Captcha error', error);
      });
    }, 0);
  }

  canGoNext(): boolean {
    if (this.page === 1) {
      this.passwordsDontMatch = this.newPassword1.length >= 8 && this.newPassword2.length >= 8 && this.newPassword1 !== this.newPassword2;
      return this.email.length > 0 && this.newPassword1.length >= 8 && this.newPassword1 === this.newPassword2 && !!this.captchaToken;
    }
    if (this.page === 2) return this.code.length === 6;
    return false;
  }

  next(): void {
    if (this.page === 1) {
      this.pending = true;
      this.code = '';
      this.sendMailError = undefined;
      this.http.post(environment.apiBaseUrl + '/auth/v1/forgot', {
        lang: this.prefService.preferences.lang,
        email: this.email,
        captchaToken: this.captchaToken,
      }).subscribe({
        complete: () => {
          this.pending = false;
          this.page++;
        },
        error: e => {
          Console.error(e);
          if (e instanceof ApiError && e.httpCode === 403 && e.errorCode === 'change-password-already-sent')
            this.sendMailError = 'pages.login.reset_password.errors.mail_already_sent';
          else {
            this.errorService.addNetworkError(e, 'pages.login.reset_password.errors.mail_error', []);
          }
          this.pending = false;
        }
      });
      return;
    }
    if (this.page === 2) {
      this.changeResult = undefined;
      const request = {
        email: this.email,
        newPassword: this.newPassword1,
        code: this.code,
      } as any;
      this.http.post(environment.apiBaseUrl + '/user/v1/resetPassword', request).subscribe({
        complete: () => {
          this.modalController.dismiss(null, 'cancel');
        },
        error: e => this.changeResult = e
      })
    }
    this.page++;
  }

  previous(): void {
    this.email = '';
    this.newPassword1 = '';
    this.newPassword2 = '';
    this.passwordsDontMatch = false;
    this.captchaToken = undefined;
    this.code = '';
    this.changeResult = undefined;
    this.page = 1;
    this.sendMailError = undefined;
    this.captchaService.unload('captcha-forgot-password');
    this.initCaptcha();
  }

  cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }

}
