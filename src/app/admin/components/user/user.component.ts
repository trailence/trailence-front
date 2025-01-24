import { Component, Input } from '@angular/core';
import { UserKey, UserKeysComponent } from 'src/app/components/user-keys/user-keys.components';
import { UserDto } from '../../model/user';
import { HttpService } from 'src/app/services/http/http.service';
import { environment } from 'src/environments/environment';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonButton, IonFooter, IonButtons, IonCheckbox, ModalController, AlertController } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { UserQuotasComponent } from 'src/app/components/user-quotas/user-quotas.component';
import { CommonModule } from '@angular/common';

@Component({
  templateUrl: './user.component.html',
  styleUrl: './user.component.scss',
  imports: [
    CommonModule,
    UserKeysComponent, UserQuotasComponent,
    IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonButton, IonFooter, IonButtons, IonCheckbox,
  ]
})
export class UserComponent {

  @Input() user!: UserDto;

  userKeysProvider = () => this.http.get<UserKey[]>(environment.apiBaseUrl + '/admin/users/v1/' + this.user.email + '/keys');

  constructor(
    public readonly i18n: I18nService,
    private readonly http: HttpService,
    private readonly modalController: ModalController,
    private readonly alertController: AlertController,
  ) {}

  close(): void {
    this.modalController.dismiss();
  }

  removeRole(role: string): void {
    const newRoles = this.user.roles.filter(r => r !== role);
    this.http.put<string[]>(environment.apiBaseUrl + '/admin/users/v1/' + this.user.email + '/roles', newRoles)
    .subscribe(list => this.user.roles = list);
  }

  addRole(): void {
    this.alertController.create({
      header: this.i18n.texts.admin.users.add_role,
      inputs: [
        {
          type: 'text',
          placeholder: this.i18n.texts.admin.users.role_name,
        }
      ],
      buttons: [
        {
          text: this.i18n.texts.buttons.ok,
          role: 'ok'
        }, {
          text: this.i18n.texts.buttons.cancel,
          role: 'cancel'
        }
      ]
    }).then(m => m.present().then(() => m.onDidDismiss().then(event => {
      if (event.role === 'ok') {
        const role = event.data.values[0].trim();
        if (role.length > 0)
          this.http.put<string[]>(environment.apiBaseUrl + '/admin/users/v1/' + this.user.email + '/roles', [...this.user.roles, role])
          .subscribe(list => this.user.roles = list);
      }
    })));
  }

}
