import { IonicCheckbox } from './ionic/ion-checkbox';
import { IonicInput } from './ionic/ion-input';
import { IonicRadioGroup } from './ionic/ion-radio-group';
import { ModalComponent } from './modal';

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
    const tagsElement = await this.contentElement.$('>>>app-tags').getElement()
    let nb = 0;
    await browser.waitUntil(async () => {
      if ((await tagsElement.$$('div.tag-node').getElements()).length === 0) return false;
      nb = 0;
      for (const node of await tagsElement.$$('div.tag-node').getElements()) {
        const name = await node.$('div.tag-name span').getText();
        if (name.trim() === '') return false;
        nb++;
      }
      return true;
    });
    const found = [];
    const existing = [];
    for (let i = 0; i < nb; ++i) {
      const name = await tagsElement.$$('div.tag-node')[i].$('div.tag-name span').getText();
      if (tags.indexOf(name) >= 0) {
        await new IonicCheckbox(tagsElement.$$('div.tag-node')[i].$('ion-checkbox')).setSelected(true);
        found.push(name);
      }
      existing.push(name);
    }
    if (found.length !== tags.length)
      throw new Error('Wanted to select tags ' + tags.join(',') + ' but only ' + found.join(',') + ' found, all found are: ' + existing.join(','));
    await (await this.getFooterButtonWithText('Continue')).click();
  }

  public async setShareName(name: string) {
    await new IonicInput(this.contentElement.$('>>>ion-input[name=name]')).setValue(name);
  }

  public async setEmail(email: string) {
    await new IonicInput(this.contentElement.$('>>>ion-input[name=email]')).setValue(email);
  }

  public async selectIncludePhotos() {
    await new IonicCheckbox(this.contentElement.$('>>>ion-checkbox[name=photos]')).setSelected(true);
  }

  public async save() {
    await (await this.getFooterButtonWithText('Save')).click();
  }

}
