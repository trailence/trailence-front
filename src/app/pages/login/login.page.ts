import { ChangeDetectorRef, Component, Injector, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { IonCard, IonCardContent, IonInput, IonItem, IonList, IonButton, IonSpinner, IonLabel, ModalController, NavController, IonToolbar } from '@ionic/angular';
import { catchError, combineLatest, filter, first, of, timeout } from 'rxjs';
import { HeaderComponent } from '@trailence/components/header/header.component';
import { AuthService } from '@trailence/services/auth/auth.service';
import { CaptchaService } from '@trailence/services/captcha/captcha.service';
import { TrailCollectionService } from '@trailence/services/database/trail-collection.service';
import { ApiError } from '@trailence/services/http/api-error';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { NetworkService } from '@trailence/services/network/network.service';
import { Console } from '@trailence/utils/console';
import { PublicPage } from '../public.page';
import { PreferencesService } from '@trailence/services/preferences/preferences.service';
import { NgStyle } from '@angular/common';
import { StoreService } from '@trailence/services/database/store/store.service';

@Component({
    selector: 'app-login',
    templateUrl: './login.page.html',
    styleUrls: ['./login.page.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        IonToolbar,
        IonLabel,
        IonSpinner,
        IonList,
        IonItem,
        IonInput,
        IonCardContent,
        IonCard,
        IonButton,
        FormsModule,
        HeaderComponent,
        NgStyle,
    ]
})
export class LoginPage extends PublicPage {

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


  private returnUrl = '';

  constructor(
    public readonly i18n: I18nService,
    network: NetworkService,
    private readonly auth: AuthService,
    route: ActivatedRoute,
    private readonly router: Router,
    private readonly changeDetector: ChangeDetectorRef,
    public readonly prefs: PreferencesService,
    injector: Injector,
  ) {
    super(injector);
    route.queryParamMap.subscribe(params => {
      this.returnUrl = params.get('returnUrl') ?? '';
      if (params.has('email')) this.email = params.get('email')!;
    });
    network.server$.subscribe(connected => {
      this.connected = !!connected;
      changeDetector.markForCheck();
    });
    this.whenVisible.subscribe(auth.auth$, a => {
      if (this.inprogress || !a) return;
      Console.debug('[LOGIN] Authenticated, routing to', this.returnUrl);
      this.injector.get(NavController).navigateRoot(this.returnUrl);
    });
  }

  onSubmit(): void {
    if (this.canSignin()) this.signin();
  }

  canSignin(): boolean {
    return this.email.length > 0 && this.password.length > 0 && (!this.captchaNeeded || !!this.captchaToken);
  }

  update(): void {
    this.changesDetection.detectChanges();
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
    if (element) while (element.children.length > 0) element.children.item(0)?.remove();
    this.progressMessage = this.i18n.texts.pages.login.signing_in;
    this.auth.login(this.email, this.password, token).subscribe({
      next: () => {
        combineLatest([
          this.auth.auth$,
          this.injector.get(StoreService).allLoaded$,
          this.injector.get(TrailCollectionService).getMyCollectionsReady$()
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
              timeout({first: 10000}),
              catchError(() => of(null))
            ).subscribe(() => {
              this.inprogress = false;
            });
            Console.debug('[LOGIN] login done, routing to', this.returnUrl);
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
    this.injector.get(StoreService);
    this.injector.get(TrailCollectionService);
    this.injector.get(NavController);
    import('../../services/database/all');
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

  createAccount(): void {
    this.router.navigateByUrl('/' + this.prefs.preferences.lang + '/register');
  }

  tryWithoutAccount(): void {
    this.router.navigateByUrl('/try');
  }

}
