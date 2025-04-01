import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonLabel, IonContent, IonFooter, IonButtons, IonButton, ModalController } from "@ionic/angular/standalone";
import { CodeInputModule } from 'angular-code-input';
import { AuthService } from 'src/app/services/auth/auth.service';
import { HttpService } from 'src/app/services/http/http.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { Console } from 'src/app/utils/console';
import { environment } from 'src/environments/environment';

@Component({
  templateUrl: './delete-me.component.html',
  styleUrl: './delete-me.component.scss',
  imports: [IonButton, IonButtons, IonFooter, IonContent, IonLabel, IonTitle, IonToolbar, IonHeader, CommonModule, CodeInputModule ]
})
export class DeleteMeComponent {

  page = 1;
  code = '';
  pending = false;

  constructor(
    public readonly i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly auth: AuthService,
    private readonly http: HttpService,
    private readonly preferences: PreferencesService,
  ) {}

  close(): void {
    this.modalController.dismiss();
  }

  confirm(): void {
    this.code = '';
    this.pending = true;
    this.http.post(environment.apiBaseUrl + '/user/v1/sendDeletionCode?lang=' + this.preferences.preferences.lang, {})
    .subscribe({
      complete: () => {
        this.pending = false;
        this.page = 2;
      },
      error: e => {
        Console.error(e);
        this.pending = false;
      }
    });
  }

  deleteMe(): void {
    this.pending = true;
    this.http.post(environment.apiBaseUrl + '/user/v1/deleteMe', this.code)
    .subscribe({
      complete: () => {
        this.pending = false;
        this.page = 3;
      },
      error: e => {
        Console.error(e);
        this.pending = false;
      }
    });
  }

  logout(): void {
    this.auth.logout(true).subscribe();
    this.close();
  }
}
