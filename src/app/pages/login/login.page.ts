import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Injector, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonInput, IonItem, IonList, IonButton, IonSpinner, IonLabel, ModalController, NavController, IonToolbar, IonIcon } from '@ionic/angular/standalone';
import { combineLatest, filter, first, Subscription } from 'rxjs';
import { AuthService } from 'src/app/services/auth/auth.service';
import { CaptchaService } from 'src/app/services/captcha/captcha.service';
import { DatabaseService } from 'src/app/services/database/database.service';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { ApiError } from 'src/app/services/http/api-error';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { NetworkService } from 'src/app/services/network/network.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { Console } from 'src/app/utils/console';
import { collection$items } from 'src/app/utils/rxjs/collection$items';

@Component({
    selector: 'app-login',
    templateUrl: './login.page.html',
    styleUrls: ['./login.page.scss'],
    imports: [
        IonIcon,
        IonToolbar,
        IonLabel,
        IonSpinner,
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
export class LoginPage implements OnInit, OnDestroy {

  email = '';
  password = '';

  inprogress = false;
  progressMessage = '';
  error = false;
  incorrect = false;
  connected = false;
  locked = false;

  catpchaInitialized = false;
  captchaNeeded = false;
  captchaToken?: string;

  destroyed = false;
  preferencesSubscription?: Subscription;
  currentLanguage?: string;

  private returnUrl = '';

  constructor(
    public i18n: I18nService,
    network: NetworkService,
    private readonly auth: AuthService,
    route: ActivatedRoute,
    private readonly router: Router,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly injector: Injector,
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

  ngOnInit(): void {
    const title = document.getElementsByTagName('head')[0].getElementsByTagName('title')[0];
    title.innerText = 'Sign in - Trailence';
    setTimeout(() => {
      if (this.destroyed) return;
      this.preferencesSubscription = this.injector.get(PreferencesService).preferences$.subscribe(p => this.currentLanguage = p.lang);
    }, 100);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.preferencesSubscription?.unsubscribe();
  }

  onSubmit(): void {
    if (this.canSignin()) this.signin();
  }

  canSignin(): boolean {
    return this.email.length > 0 && this.password.length > 0 && (!this.captchaNeeded || !!this.captchaToken);
  }

  signin(): void {
    if (this.catpchaInitialized) {
      this.injector.get(CaptchaService).unload('captcha-login');
      this.catpchaInitialized = false;
    }
    this.inprogress = true;
    this.error = false;
    this.incorrect = false;
    this.locked = false;
    this.captchaNeeded = false;
    const token = this.captchaToken;
    this.captchaToken = undefined;
    const element = document.getElementById('captcha-login');
    if (element) while (element.children.length > 0) element.removeChild(element.children.item(0)!);
    this.progressMessage = this.i18n.texts.pages.login.signing_in;
    this.auth.login(this.email, this.password, token).subscribe({
      next: () => {
        combineLatest([
          this.auth.auth$,
          this.injector.get(DatabaseService).allLoaded(),
          this.injector.get(TrailCollectionService).getAll$().pipe(collection$items())
        ]).pipe(
          filter(([a,l,c]) => {
            if (a) this.progressMessage = this.i18n.texts.pages.login.downloading_data;
            return !a || (l && c.length > 0);
          }),
          first(),
        ).subscribe(([a,l,c]) => {
          if (a) {
            this.router.events.pipe(
              filter(e => e instanceof NavigationEnd),
              first(),
            ).subscribe(() => {
              this.inprogress = false;
            });
            this.injector.get(NavController).navigateRoot(this.returnUrl);
          } else {
            this.inprogress = false;
          }
        });
      },
      error: error => {
        Console.warn('Login error', error);
        if (error instanceof ApiError && error.httpCode === 403) {
          if (error.errorCode === 'captcha-needed') {
            this.captchaNeeded = true;
            this.catpchaInitialized = true;
            this.injector.get(CaptchaService).displayOn('captcha-login', token => {
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
    // loading services in parallel
    this.injector.get(DatabaseService);
    this.injector.get(TrailCollectionService);
    this.injector.get(NavController);
  }

  setLanguage(lang: string): void {
    this.injector.get(PreferencesService).setLanguage(lang);
  }

  async resetPassword() {
    const module = await import('./reset-password/reset-password.component');
    const modal = await this.injector.get(ModalController).create({
      component: module.ResetPasswordComponent,
      componentProps: {
        email: this.email
      }
    });
    modal.present();
  }

}
