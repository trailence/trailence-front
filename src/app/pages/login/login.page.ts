import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonInput, IonItem, IonList, IonButton } from '@ionic/angular/standalone';
import { AuthService } from 'src/app/services/auth/auth.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { NetworkService } from 'src/app/services/network/newtork.service';

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

  constructor(
    public i18n: I18nService,
    public network: NetworkService,
    private auth: AuthService,
  ) {}

  canSignin(): boolean {
    return this.email.length > 0 && this.password.length > 0;
  }

  signin(): void {
    this.auth.login(this.email, this.password).subscribe({
      next: () => {
        // TODO
      },
      error: error => {
        // TODO
      }
    });
  }

}
