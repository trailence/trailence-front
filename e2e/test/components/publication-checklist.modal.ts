import { TestUtils } from '../utils/test-utils';
import { IonicCheckbox } from './ionic/ion-checkbox';
import { ModalComponent } from './modal';

export class PublicationChecklistModal extends ModalComponent {

  public async checkAll() {
    await TestUtils.retry(async () => {
      const checkboxes = this.getElement().$$('>>>ion-checkbox');
      const nb = await checkboxes.length
      for (let i = 0; i < nb; ++i) {
        await new IonicCheckbox(checkboxes[i]).setSelected(true);
      }
      for (let i = 0; i < nb; ++i) if (await new IonicCheckbox(checkboxes[i]).getStatus() !== true) throw new Error('Checkbox still not checked');
    }, 10, 250);
  }

}
