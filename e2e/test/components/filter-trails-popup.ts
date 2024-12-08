import { App } from '../app/app';
import { FilterNumeric } from './filter-numeric.component';
import { IonicButton } from './ionic/ion-button';
import { IonicCheckbox } from './ionic/ion-checkbox';
import { IonicRadioGroup } from './ionic/ion-radio-group';
import { ModalComponent } from './modal'

export class FilterTrailsPopup extends ModalComponent {

  public get showOnlyVisibleCheckbox() { return new IonicCheckbox(this.getElement().$('>>>ion-checkbox.filter-map')); }

  public async setNumericFilter(filterName: string, minValue: number | undefined, maxValue: number | undefined) {
    const headers = this.getElement().$$('>>>div.filter-header>div');
    let textElement;
    for (const header of await headers.getElements()) {
      await header.scrollIntoView({block: 'center', inline: 'center'});
      const text = await header.getText();
      if (text === filterName) {
        textElement = header;
        break;
      }
    }
    if (!textElement) throw new Error('Filter not found: ' + filterName);
    const filterHeader = textElement.parentElement();
    const filterValue = filterHeader.nextElement();
    const filter = new FilterNumeric(filterValue.$('app-filter-numeric'));
    await filter.setValues(minValue, maxValue);
  }

  public async setTagsFilter(type: string, tags: string[]) {
    const button = new IonicButton(this.getElement().$('>>>app-filter-tags ion-button'));
    await button.click();
    const modal = new ModalComponent(await App.waitModal(2));
    const radioGroup = new IonicRadioGroup(modal.getElement().$('>>>ion-radio-group'));
    await radioGroup.selectValue(type);
    const checkboxes = modal.getElement().$$('>>>ion-checkbox');
    const tagsFounds = [];
    const foundTexts = [];
    for (const cb of await checkboxes.getElements()) {
      await cb.scrollIntoView({block: 'center', inline: 'center'});
      const text = await cb.getText();
      foundTexts.push(text);
      if (tags.indexOf(text) >= 0) {
        await cb.click();
        tagsFounds.push(text);
      }
    }
    if (tagsFounds.length !== tags.length) {
      throw new Error('Some tags were not found: searched ' + tags.join(',') + ', found: ' + foundTexts.join(','));
    }
    await (await modal.getFooterButtonWithText('Close')).click();
    await browser.waitUntil(() => modal.isDisplayed().then(d => !d));
  }

  public async resetFilters() {
    await (await this.getFooterButtonWithText('Reset all filters')).click();
  }

  public async close() {
    await (await this.getFooterButtonWithText('Close')).click();
  }

}
