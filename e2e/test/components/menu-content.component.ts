import { Component } from './component';

export class MenuContent extends Component {

  public get items() { return this.getElement().$$('ion-list>ion-item'); }

  public async getItemText(item: ChainablePromiseElement) {
    const label = item.$('>>>ion-label');
    await label.waitForDisplayed();
    return await label.getText();
  }

  public async clickItemWithText(text: string) {
    for (const item of await this.items.getElements()) {
      if (await this.getItemText(item) === text) {
        await item.click();
        return;
      }
    }
    throw new Error('Item not found in menu: ' + text);
  }

}
