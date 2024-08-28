import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonInput, IonItem, IonList, IonButton, IonSpinner, IonLabel, ModalController } from '@ionic/angular/standalone';
import { AuthService } from 'src/app/services/auth/auth.service';
import { CaptchaService } from 'src/app/services/captcha/captcha.service';
import { ApiError } from 'src/app/services/http/api-error';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { NetworkService } from 'src/app/services/network/network.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [IonLabel, IonSpinner,
    IonList,
    IonItem,
    IonInput,
    IonCardContent,
    IonCardTitle,
    IonCardHeader,
    IonCard,
    IonButton,
    FormsModule,
    CommonModule,
  ]
})
export class LoginPage {

  email = '';
  password = '';

  inprogress = false;
  error = false;
  incorrect = false;
  connected = false;
  locked = false;

  captchaNeeded = false;
  captchaToken?: string;

  private returnUrl = '';

  constructor(
    public i18n: I18nService,
    network: NetworkService,
    private auth: AuthService,
    route: ActivatedRoute,
    private router: Router,
    private changeDetector: ChangeDetectorRef,
    private captchaService: CaptchaService,
    private modalController: ModalController,
    public preferencesService: PreferencesService,
  ) {
    route.queryParamMap.subscribe(params => {
      this.returnUrl = params.get('returnUrl') ?? '';
      if (params.has('email')) this.email = params.get('email')!;
    });
    network.server$.subscribe(connected => {
      this.connected = connected;
      changeDetector.markForCheck();
    });
  }

  onSubmit(): void {
    if (this.canSignin()) this.signin();
  }

  canSignin(): boolean {
    return this.email.length > 0 && this.password.length > 0 && (!this.captchaNeeded || !!this.captchaToken);
  }

  signin(): void {
    this.captchaService.unload('captcha-login');
    this.inprogress = true;
    this.error = false;
    this.incorrect = false;
    this.locked = false;
    this.captchaNeeded = false;
    const token = this.captchaToken;
    this.captchaToken = undefined;
    const element = document.getElementById('captcha-login');
    if (element) while (element.children.length > 0) element.removeChild(element.children.item(0)!);
    this.auth.login(this.email, this.password, token).subscribe({
      next: () => {
        this.router.navigateByUrl(this.returnUrl);
        this.inprogress = false;
      },
      error: error => {
        console.log(error);
        if (error instanceof ApiError && error.httpCode === 403) {
          if (error.errorCode === 'captcha-needed') {
            this.captchaNeeded = true;
            this.captchaService.displayOn('captcha-login', token => {
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
          } else if (error.errorCode === 'locked') {
            this.locked = true;
          } else {
            this.incorrect = true;
          }
        } else
          this.error = true;
        this.inprogress = false;
      }
    });
  }

  async resetPassword() {
    const module = await import('./reset-password/reset-password.component');
    const modal = await this.modalController.create({
      component: module.ResetPasswordComponent
    });
    modal.present();
  }

}
