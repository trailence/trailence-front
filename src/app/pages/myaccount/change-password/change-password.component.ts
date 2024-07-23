import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonLabel, IonContent, IonButtons, IonFooter, IonButton, ModalController, IonInput } from "@ionic/angular/standalone";
import { CodeInputModule } from 'angular-code-input';
import { HttpService } from 'src/app/services/http/http.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-change-password',
  templateUrl: './change-password.component.html',
  styleUrls: ['./change-password.component.scss'],
  standalone: true,
  imports: [IonInput, IonButton, IonFooter, IonButtons, IonContent, IonLabel, IonTitle, IonToolbar, IonHeader, CommonModule, FormsModule, CodeInputModule ]
})
export class ChangePasswordComponent {

  page = 1;
  previousPassword = '';
  newPassword1 = '';
  newPassword2  ='';
  code = '';
  changeResult: any = undefined;

  constructor(
    public i18n: I18nService,
    private modalController: ModalController,
    private http: HttpService,
  ) { }

  canGoNext(): boolean {
    if (this.page === 1) return this.previousPassword.length > 0 && this.newPassword1.length >= 8 && this.newPassword1 === this.newPassword2;
    if (this.page === 2) return this.code.length === 6;
    return false;
  }

  next(): void {
    if (this.page === 1) {
      this.http.get(environment.apiBaseUrl + '/user/v1/sendChangePasswordCode?lang=' + this.i18n.textsLanguage).subscribe();
      this.code = '';
    } else if (this.page === 2) {
      this.changeResult = undefined;
      this.http.post(environment.apiBaseUrl + '/user/v1/changePassword', {
        previousPassword: this.previousPassword,
        newPassword: this.newPassword1,
        code: this.code
      }).subscribe({
        complete: () => {
          this.modalController.dismiss(null, 'cancel');
        },
        error: e => this.changeResult = e
      })
    }
    this.page++;
  }

  previous(): void {
    this.previousPassword = '';
    this.newPassword1 = '';
    this.newPassword2 = '';
    this.code = '';
    this.changeResult = undefined;
    this.page = 1;
  }

  cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }

}
