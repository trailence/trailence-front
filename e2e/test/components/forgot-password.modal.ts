import { CodeInput } from './code-input.component';
import { IonicInput } from './ionic/ion-input';
import { ModalComponent } from './modal';

export class ForgotPasswordModal extends ModalComponent {

  public get emailInput() { return new IonicInput(this.getElement().$('ion-input[name=email]')); }
  public get newPasswordInput() { return new IonicInput(this.getElement().$('ion-input[name=new-password]')); }
  public get newPassword2Input() { return new IonicInput(this.getElement().$('ion-input[name=new-password2]')); }

  public get codeInput() { return new CodeInput(this.getElement().$('code-input')); }

}
