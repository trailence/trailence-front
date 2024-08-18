import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonLabel, IonContent, IonButtons, IonFooter, IonButton, ModalController, IonInput } from "@ionic/angular/standalone";
import { CodeInputModule } from 'angular-code-input';
import { CaptchaService } from 'src/app/services/captcha/captcha.service';
import { HttpService } from 'src/app/services/http/http.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss'],
  standalone: true,
  imports: [IonInput, IonButton, IonFooter, IonButtons, IonContent, IonLabel, IonTitle, IonToolbar, IonHeader, CommonModule, FormsModule, CodeInputModule ]
})
export class ResetPasswordComponent implements OnInit {

  page = 1;
  email = '';
  newPassword1 = '';
  newPassword2  ='';
  captchaToken?: string;
  code = '';
  changeResult: any = undefined;

  constructor(
    public i18n: I18nService,
    private modalController: ModalController,
    private http: HttpService,
    private captchaService: CaptchaService,
    private changeDetector: ChangeDetectorRef,
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
        console.log('error', error);
      });
    }, 0);
  }

  canGoNext(): boolean {
    if (this.page === 1) return this.email.length > 0 && this.newPassword1.length >= 8 && this.newPassword1 === this.newPassword2 && !!this.captchaToken;
    if (this.page === 2) return this.code.length === 6;
    return false;
  }

  next(): void {
    if (this.page === 1) {
      this.http.post(environment.apiBaseUrl + '/auth/v1/forgot', {
        lang: this.i18n.textsLanguage,
        email: this.email,
        captchaToken: this.captchaToken,
      }).subscribe();
      this.code = '';
    } else if (this.page === 2) {
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
    this.captchaToken = undefined;
    this.code = '';
    this.changeResult = undefined;
    this.page = 1;
    this.captchaService.unload('captcha-forgot-password');
    this.initCaptcha();
  }

  cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }

}
