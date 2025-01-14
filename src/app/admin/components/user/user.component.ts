import { Component, Input } from '@angular/core';
import { UserKey, UserKeysComponent } from 'src/app/components/user-keys/user-keys.components';
import { UserDto } from '../../model/user';
import { HttpService } from 'src/app/services/http/http.service';
import { environment } from 'src/environments/environment';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonButton, IonFooter, IonButtons, IonCheckbox, ModalController } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Component({
  templateUrl: './user.component.html',
  styleUrl: './user.component.scss',
  imports: [
    UserKeysComponent,
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
  ) {}

  close(): void {
    this.modalController.dismiss();
  }

}
