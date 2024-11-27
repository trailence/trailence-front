import { IonicCheckbox } from './ionic/ion-checkbox';
import { IonicRadioGroup } from './ionic/ion-radio-group';
import { ModalComponent } from './modal';

export class ExportTrailModal extends ModalComponent {

  public get exportTypeRadioGroup() { return new IonicRadioGroup(this, '>>>ion-radio-group'); }

  public get includePhotosCheckbox() { return new IonicCheckbox(this, '>>>ion-checkbox'); }

}
