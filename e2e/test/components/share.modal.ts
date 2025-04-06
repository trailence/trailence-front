import { IonicCheckbox } from './ionic/ion-checkbox';
import { IonicInput } from './ionic/ion-input';
import { IonicRadioGroup } from './ionic/ion-radio-group';
import { ModalComponent } from './modal';
import { TagsPopup } from './tags-popup';

export class ShareModal extends ModalComponent {

  public async shareWholeCollection() {
    const radioGroup = new IonicRadioGroup(this.contentElement.$('>>>ion-radio-group'));
    await radioGroup.selectValue('COLLECTION');
    await (await this.getFooterButtonWithText('Continue')).click();
  }

  public async shareTags() {
    const radioGroup = new IonicRadioGroup(this.contentElement.$('>>>ion-radio-group'));
    await radioGroup.selectValue('TAG');
    await (await this.getFooterButtonWithText('Continue')).click();
  }

  public async selectTags(tags: string[]) {
    const tagsPopup = new TagsPopup('selection', this.contentElement.$('>>>app-tags'));
    await tagsPopup.selectTags(tags, false);
    await (await this.getFooterButtonWithText('Continue')).click();
  }

  public async setShareName(name: string) {
    await new IonicInput(this.contentElement.$('>>>ion-input[name=name]')).setValue(name);
  }

  public async addEmail(email: string) {
    const recipientsElements = await this.contentElement.$$('>>>div.recipients ion-input').getElements();
    await new IonicInput(recipientsElements[recipientsElements.length - 1]).setValue(email);
  }

  public async selectIncludePhotos() {
    await new IonicCheckbox(this.contentElement.$('>>>ion-checkbox[name=photos]')).setSelected(true);
  }

  public async save() {
    await (await this.getFooterButtonWithText('Save')).click();
    await this.waitNotDisplayed();
  }

}
