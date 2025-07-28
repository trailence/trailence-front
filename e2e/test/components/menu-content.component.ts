import { TestUtils } from '../utils/test-utils';
import { Component } from './component';

export class MenuContent extends Component {

  public getItemWithText(text: string) {
    return this.getElement().$('ion-label=' + text);
  }

  public async clickItemWithText(text: string) {
    await this.getItemWithText(text).click();
  }

  public async clickItemWithColorAndText(color: string, text: string) {
    const itemsWithColor = await this.getElement().$$('ion-item.ion-color-' + color).getElements();
    for (const item of itemsWithColor) {
      const label = item.$('ion-label=' + text);
      if (await label.isExisting()) {
        await item.click();
        return;
      }
    }
    throw new Error('Cannot find item with color ' + color + ' and text ' + text);
  }

  public async clickItemWithColor(color: string) {
    await this.getElement().$('ion-item.ion-color-' + color).click();
  }

  public async clickItemWithIcon(icon: string) {
    await this.getElement().$('ion-icon[name=' + icon + ']').click();
  }

  public async hasItem(text: string) {
    return await this.getElement().$('ion-label=' + text).isExisting();
  }

  public async close() {
    await TestUtils.retry(async () => {
      await browser.action('pointer').move({x: 1, y: 1, origin: 'viewport'}).pause(10).down().pause(10).up().perform();
      await browser.waitUntil(() => this.getElement().isDisplayed().then(d => !d), {timeout: 2000});
    }, 3, 1000);
  }

}
