import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonInput, IonItem, IonList, IonButton } from '@ionic/angular/standalone';
import { AuthService } from 'src/app/services/auth/auth.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { NetworkService } from 'src/app/services/network/network.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
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

  private returnUrl = '';

  constructor(
    public i18n: I18nService,
    public network: NetworkService,
    private auth: AuthService,
    route: ActivatedRoute,
    private router: Router,
  ) {
    route.queryParamMap.subscribe(params => {
      this.returnUrl = params.get('returnUrl') ?? '';
    });
  }

  canSignin(): boolean {
    return this.email.length > 0 && this.password.length > 0;
  }

  signin(): void {
    this.auth.login(this.email, this.password).subscribe({
      next: () => {
        this.router.navigateByUrl(this.returnUrl);
      },
      error: error => {
        // TODO
      }
    });
  }

}
