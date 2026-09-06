import { Component, ChangeDetectionStrategy } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonLabel, IonContent, IonFooter, IonButtons, IonButton, ModalController } from "@ionic/angular";
import { CodeInputModule } from 'angular-code-input';
import { AuthService } from '@trailence/services/auth/auth.service';
import { HttpService } from '@trailence/services/http/http.service';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { PreferencesService } from '@trailence/services/preferences/preferences.service';
import { Console } from '@trailence/utils/console';
import { environment } from '@env/environment';

@Component({
  templateUrl: './delete-me.component.html',
  styleUrl: './delete-me.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    IonButton, IonButtons, IonFooter, IonContent, IonLabel, IonTitle, IonToolbar, IonHeader,
    CodeInputModule,
  ]
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
