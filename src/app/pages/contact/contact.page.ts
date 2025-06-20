import { ChangeDetectorRef, Component, Injector } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonInput, IonTextarea, IonSelect, IonSelectOption, IonButton, IonIcon } from '@ionic/angular/standalone';
import { AuthService } from 'src/app/services/auth/auth.service';
import { CommonModule } from '@angular/common';
import { CaptchaService } from 'src/app/services/captcha/captcha.service';
import { Console } from 'src/app/utils/console';
import { EMAIL_REGEX } from 'src/app/utils/string-utils';
import { HttpService } from 'src/app/services/http/http.service';
import { environment } from 'src/environments/environment';
import { ApiError } from 'src/app/services/http/api-error';
import { Subscription } from 'rxjs';
import { NetworkService } from 'src/app/services/network/network.service';
import { FormsModule } from '@angular/forms';
import { PublicPage } from '../public.page';

@Component({
  templateUrl: './contact.page.html',
  styleUrl: './contact.page.scss',
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    IonInput, IonTextarea, IonSelect, IonSelectOption, IonButton, IonIcon,
  ]
})
export class ContactPage extends PublicPage {

  constructor(
    public readonly i18n: I18nService,
    public readonly auth: AuthService,
    private readonly captchaService: CaptchaService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly http: HttpService,
    private readonly networkService: NetworkService,
    injector: Injector,
  ) {
    super(injector);
  }

  email = '';
  type = '';
  message = '';
  captchaToken?: string;
  captchaNeeded = false;
  sending = false;
  error = false;
  retryWithCaptcha = false;
  sent = false;
  networkAvailable = false;
  networkSubscription?: Subscription;
  captchaInit = false;

  protected override initComponent(): void {
    this.init();
  }

  protected override destroyComponent(): void {
    this.destroy();
  }


  override ionViewWillEnter(): void {
    this.init();
    super.ionViewWillEnter();
  }

  override ionViewWillLeave(): void {
    this.destroy();
    super.ionViewWillLeave();
  }

  private init(): void {
    this.networkSubscription ??= this.networkService.server$.subscribe(available => {
      this.networkAvailable = available;
      if (this.captchaNeeded && !this.captchaInit) this.initCaptcha();
    });
    this.email = '';
    this.type = '';
    this.message = '';
    this.captchaToken = undefined;
    this.captchaNeeded = !this.auth.auth;
    if (this.captchaNeeded && !this.captchaInit && this.networkAvailable) this.initCaptcha();
    this.sending = false;
    this.sent = false;
    this.error = false;
    this.retryWithCaptcha = false;
  }

  private destroy(): void {
    this.networkSubscription?.unsubscribe();
    this.networkSubscription = undefined;
    this.captchaNeeded = false;
    this.captchaService.unload('captcha-contact');
    this.captchaInit = false;
  }

  private initCaptcha(): void {
    this.captchaInit = true;
    setTimeout(() => {
      this.captchaService.displayOn('captcha-contact', token => {
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

  isValid(): boolean {
    if (!this.networkAvailable) return false;
    if (!this.auth.auth && (
      this.email.trim().length === 0 ||
      !EMAIL_REGEX.test(this.email.trim())
    )) return false;
    if (this.type.length === 0) return false;
    if (this.message.trim().length < 15) return false;
    if (this.captchaNeeded && !this.captchaToken) return false;
    return true;
  }

  send(): void {
    const request = {
      email: this.auth.email ?? this.email,
      type: this.type,
      message: this.message,
      captcha: this.captchaToken
    };
    this.sending = true;
    this.error = false;
    this.sent = false;
    this.retryWithCaptcha = false;
    this.http.post(environment.apiBaseUrl + '/contact/v1', request).subscribe({
      complete: () => {
        this.captchaNeeded = false;
        this.captchaService.unload('captcha-contact');
        this.captchaInit = false;
        this.ionViewWillEnter();
        this.sent = true;
      },
      error: e => {
        Console.error(e);
        if (e instanceof ApiError && e.errorCode === 'captcha-needed') {
          this.captchaNeeded = true;
          if (!this.captchaInit && this.networkAvailable) {
            this.initCaptcha();
          }
          this.sending = false;
          this.retryWithCaptcha = true;
          return;
        }
        this.sending = false;
        this.error = true;
      },
    });
  }

}
