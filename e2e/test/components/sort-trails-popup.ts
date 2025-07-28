import { IonicRadioGroup } from './ionic/ion-radio-group';
import { ModalComponent } from './modal';
import { ToggleChoice } from './toggle-choice.component';

export class SortTrailsPopup extends ModalComponent {

  public async setAscending(ascending: boolean) {
    const toggle = new ToggleChoice(this.getElement().$('>>>app-toggle-choice'));
    await toggle.selectValue(!ascending);
  }

  public async selectField(field: string) {
    const group = new IonicRadioGroup(this.getElement().$('>>>ion-radio-group'));
    await group.selectValue(field);
  }

  public async close() {
    await (await this.getFooterButtonWithText('Close')).click();
    await browser.waitUntil(() => this.getElement().isDisplayed().then(d => !d));
  }

}
