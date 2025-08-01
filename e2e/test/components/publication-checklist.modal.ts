import { IonicCheckbox } from './ionic/ion-checkbox';
import { ModalComponent } from './modal';

export class PublicationChecklistModal extends ModalComponent {

  public async checkAll() {
    for (let i = 0; i < 2; ++i) {
      const checkboxes = this.getElement().$$('>>>ion-checkbox');
      const nb = await checkboxes.length
      for (let i = 0; i < nb; ++i) {
        await new IonicCheckbox(checkboxes[i]).setSelected(true);
      }
    }
  }

}
