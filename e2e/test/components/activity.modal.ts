import { ModalComponent } from './modal';

export class ActivityModal extends ModalComponent {

  public async select(activity?: string) {
    if (!activity) activity = 'unspecified';
    await this.getElement().$('>>>ion-item.activity-' + activity).click();
  }

  public async apply() {
    (await this.getFooterButtonWithColor('success')).click();
    await this.waitNotDisplayed();
  }

}
