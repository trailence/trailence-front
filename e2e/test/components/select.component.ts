import { App } from '../app/app';
import { AppElement } from '../app/app-element';
import { TestUtils } from '../utils/test-utils';
import { Component } from './component';
import { ModalComponent } from './modal';

export type SelectType = 'single' | 'multiple';

export class SelectComponent extends Component {

  constructor(
    private readonly type: SelectType,
    parent: AppElement | ChainablePromiseElement | (() => ChainablePromiseElement),
  ) {
    super(parent);
  }

  public async openModal() {
    await Component.scrollIntoView(this.getElement());
    await this.getElement().click();
    return await SelectModal.waitModal(this.type);
  }

  public async selectByText(text: string) {
    const modal = await this.openModal();
    await modal.selectByText(text);
    await modal.apply();
  }

}

export class SelectModal extends ModalComponent {

  public static async waitModal(type: SelectType) {
    const modal = await App.waitModal({byClassName: 'select-modal'});
    return new SelectModal(type, modal);
  }

  constructor(
    private readonly type: SelectType,
    parent: AppElement | ChainablePromiseElement | (() => ChainablePromiseElement),
  ) {
    super(parent);
  }

  public async selectByText(text: string) {
    await TestUtils.retry(async () => {
      const found: string[] = [];
      if (this.type === 'single') {
        const items = await this.getElement().$$('>>>ion-item').getElements();
        for (const item of items) {
          const itemText = (await item.$('>>>ion-label').getText()).trim();
          found.push(itemText)
          if (itemText === text) {
            await Component.scrollElementIntoView(item);
            await item.click();
            return;
          }
        }
      }
      throw new Error('Cannot find select modal label <' + text + '>, found: ' + found.join(','));
    }, 5, 100);
  }

  public async selectByValue(value: string) {
    if (this.type === 'single') {
      const item = this.getElement().$('ion-item.item-value-' + value);
      await browser.waitUntil(() => item.waitForExist());
      await Component.scrollIntoView(item);
      await item.click();
    }
  }

  public async apply() {
    await (await this.getFooterButtonWithText('Apply')).click();
  }

}
