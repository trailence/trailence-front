import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonLabel, IonContent, IonButtons, IonFooter, IonButton, ModalController, IonInput } from "@ionic/angular/standalone";
import { CodeInputModule } from 'angular-code-input';
import { AuthService } from 'src/app/services/auth/auth.service';
import { ApiError } from 'src/app/services/http/api-error';
import { HttpService } from 'src/app/services/http/http.service';
import { I18nPipe } from 'src/app/services/i18n/i18n-string';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { ErrorService } from 'src/app/services/progress/error.service';
import { Console } from 'src/app/utils/console';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-change-password',
  templateUrl: './change-password.component.html',
  styleUrls: ['./change-password.component.scss'],
  imports: [
    IonInput, IonButton, IonFooter, IonButtons, IonContent, IonLabel, IonTitle, IonToolbar, IonHeader,
    FormsModule,
    CodeInputModule,
    I18nPipe,
  ]
})
export class ChangePasswordComponent {

  hasPreviousPassword = true;
  page = 1;
  previousPassword = '';
  newPassword1 = '';
  newPassword2  ='';
  code = '';
  changeResult: any = undefined;

  passwordsDontMatch = false;
  pending = false;
  sendMailError?: string;

  constructor(
    public i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly http: HttpService,
    public auth: AuthService,
    private readonly prefService: PreferencesService,
    private readonly errorService: ErrorService,
  ) {
    this.hasPreviousPassword = auth.auth?.complete === false ? false : true; // NOSONAR
  }

  onSubmit(): void {
    if (this.canGoNext() && !this.pending) this.next();
  }

  canGoNext(): boolean {
    if (this.page === 1) {
      this.passwordsDontMatch = this.newPassword1.length >= 8 && this.newPassword2.length >= 8 && this.newPassword1 !== this.newPassword2;
      return (!this.hasPreviousPassword || this.previousPassword.length > 0) && this.newPassword1.length >= 8 && this.newPassword1 === this.newPassword2;
    }
    if (this.page === 2) return this.code.length === 6;
    return false;
  }

  next(): void {
    if (this.page === 1) {
      this.pending = true;
      this.code = '';
      this.sendMailError = undefined;
      this.http.get(environment.apiBaseUrl + '/user/v1/sendChangePasswordCode?lang=' + this.prefService.preferences.lang)
      .subscribe({
        complete: () => {
          this.pending = false;
          this.page++;
        },
        error: e => {
          Console.error(e);
          if (e instanceof ApiError && e.httpCode === 403 && e.errorCode === 'change-password-already-sent')
            this.sendMailError = 'pages.myaccount.change_password.errors.mail_already_sent';
          else {
            this.errorService.addNetworkError(e, 'pages.myaccount.change_password.errors.mail_error', []);
          }
          this.pending = false;
        }
      });
      return;
    }
    if (this.page === 2) {
      this.changeResult = undefined;
      const request = {
        newPassword: this.newPassword1,
        code: this.code,
      } as any;
      if (this.hasPreviousPassword) request.previousPassword = this.previousPassword;
      this.http.post(environment.apiBaseUrl + '/user/v1/changePassword', request).subscribe({
        complete: () => {
          this.modalController.dismiss(null, 'cancel');
          this.auth.completed();
        },
        error: e => this.changeResult = e
      })
    }
    this.page++;
  }

  previous(): void {
    this.previousPassword = '';
    this.newPassword1 = '';
    this.newPassword2 = '';
    this.passwordsDontMatch = false;
    this.code = '';
    this.changeResult = undefined;
    this.page = 1;
    this.sendMailError = undefined;
  }

  cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }

}
