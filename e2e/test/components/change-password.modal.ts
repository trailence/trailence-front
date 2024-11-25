import { CodeInput } from './code-input.component';
import { IonicInput } from './ionic/ion-input';
import { ModalComponent } from './modal';

export class ChangePasswordModal extends ModalComponent {

  public get currentPasswordInput() { return new IonicInput(this.getElement().$('ion-input[name=password]')); }
  public get newPasswordInput() { return new IonicInput(this.getElement().$('ion-input[name=newpassword1]')); }
  public get newPassword2Input() { return new IonicInput(this.getElement().$('ion-input[name=newpassword2]')); }

  public get codeInput() { return new CodeInput(this.getElement().$('code-input')); }

}
