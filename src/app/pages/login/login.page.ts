import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonInput, IonItem, IonList, IonButton, IonSpinner, IonLabel } from '@ionic/angular/standalone';
import { AuthService } from 'src/app/services/auth/auth.service';
import { ApiError } from 'src/app/services/http/api-error';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { NetworkService } from 'src/app/services/network/network.service';

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

  private returnUrl = '';

  constructor(
    public i18n: I18nService,
    network: NetworkService,
    private auth: AuthService,
    route: ActivatedRoute,
    private router: Router,
    changeDetector: ChangeDetectorRef,
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

  canSignin(): boolean {
    return this.email.length > 0 && this.password.length > 0;
  }

  signin(): void {
    this.inprogress = true;
    this.error = false;
    this.incorrect = false;
    this.auth.login(this.email, this.password).subscribe({
      next: () => {
        this.router.navigateByUrl(this.returnUrl);
        this.inprogress = false;
      },
      error: error => {
        console.log(error);
        if (error instanceof ApiError && error.httpCode === 403)
          this.incorrect = true;
        else
          this.error = true;
        this.inprogress = false;
      }
    });
  }

}
