import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { IonCard, IonToolbar, IonLabel, IonCardContent, IonList, IonItem, IonInput, IonButton, IonSpinner, NavController } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { NetworkService } from 'src/app/services/network/network.service';
import { LanguageBarComponent } from '../login/language-bar.component';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { CaptchaService } from 'src/app/services/captcha/captcha.service';
import { Console } from 'src/app/utils/console';
import { CodeInputModule } from 'angular-code-input';
import { EMAIL_REGEX, StringUtils } from 'src/app/utils/string-utils';
import { HttpService } from 'src/app/services/http/http.service';
import { environment } from 'src/environments/environment';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { AuthService } from 'src/app/services/auth/auth.service';

@Component({
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
  imports: [
    CommonModule, FormsModule,
    HeaderComponent, LanguageBarComponent, CodeInputModule,
    IonSpinner, IonButton, IonInput, IonItem, IonList, IonCardContent, IonLabel, IonToolbar, IonCard,
  ]
})
export class RegisterPage implements OnInit, OnDestroy {

  connected = false;
  inprogress = false;

  step = 1;
  email = '';
  password1 = '';
  password2 = '';
  captchaToken?: string;
  code = '';
  error?: string;

  constructor(
    public readonly i18n: I18nService,
    network: NetworkService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly captchaService: CaptchaService,
    private readonly http: HttpService,
    private readonly preferences: PreferencesService,
    private readonly auth: AuthService,
    private readonly navController: NavController,
  ) {
    network.server$.subscribe(connected => {
      this.connected = connected;
      changeDetector.markForCheck();
    });
  }

  private langSubscription?: Subscription;

  ngOnInit(): void {
    const title = document.getElementsByTagName('head')[0].getElementsByTagName('title')[0];
    this.langSubscription = this.i18n.texts$.subscribe(texts => title.innerText = texts.pages.register.title + ' - Trailence');
    this.initCaptcha();
  }

  ngOnDestroy(): void {
    this.langSubscription?.unsubscribe();
  }

  onSubmit(): void {
    if (this.inprogress) return;
    switch (this.step) {
      case 1:
        if (!this.isStep1Valid()) return;
        this.inprogress = true;
        this.error = undefined;
        this.http.post(environment.apiBaseUrl + '/user/v1/sendRegisterCode', {
          email: this.email,
          lang: this.preferences.preferences.lang,
          captcha: this.captchaToken
        }).subscribe({
          complete: () => {
            this.step = 2;
            this.inprogress = false;
          },
          error: e => {
            Console.error(e);
            this.error = this.i18n.texts.pages.register.errors.network;
            this.inprogress = false;
          },
        });
        break;
      case 2:
        this.inprogress = true;
        this.error = undefined;
        this.http.post(environment.apiBaseUrl + '/user/v1/registerNewUser', {
          email: this.email,
          lang: this.preferences.preferences.lang,
          code: this.code,
          password: this.password1,
        }).subscribe({
          complete: () => {
            this.step = 3;
            this.auth.login(this.email, this.password1).subscribe({
              next: () => {
                this.navController.navigateRoot('/trails/collection/my_trails');
              },
              error: e => {
                Console.error(e);
                this.error = this.i18n.texts.pages.register.errors.network;
                this.inprogress = false;
                this.step = 1;
              }
            });
          },
          error: e => {
            Console.error(e);
            this.error = this.i18n.texts.pages.register.errors.network;
            this.inprogress = false;
            this.step = 1;
            this.code = '';
          },
        });
        break;
    }
  }

  back(): void {
    if (this.inprogress) return;
    this.step--;
    this.code = '';
  }

  isStep1Valid(): boolean {
    return this.email.length > 0 && EMAIL_REGEX.test(this.email) && StringUtils.isValidPassword(this.password1) && this.password1 == this.password2 && !!this.captchaToken;
  }

  validateStep1(): void {
    this.error = undefined;
    if (this.email.length > 0 && !EMAIL_REGEX.test(this.email)) {
      this.error = this.i18n.texts.pages.register.errors.invalidEmail;
      return;
    }
    if (this.password1.length > 0 && this.password2.length > 0) {
      if (!StringUtils.isValidPassword(this.password1)) {
        this.error = this.i18n.texts.errors.password_strength;
        return;
      }
      if (this.password1 !== this.password2) {
        this.error = this.i18n.texts.pages.register.errors.passwordsDontMatch;
        return;
      }
    }
  }

  private initCaptcha(): void {
    setTimeout(() => {
      this.captchaService.displayOn('captcha-register', token => {
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
}
