import { Component } from './component';

export class MenuContent extends Component {

  public async clickItemWithText(text: string) {
    await this.getElement().$('ion-label=' + text).click();
  }

  public async hasItem(text: string) {
    return await this.getElement().$('ion-label=' + text).isExisting();
  }

  public async close() {
    await browser.action('pointer').move({x: 1, y: 1, origin: 'viewport'}).pause(10).down().pause(10).up().perform();
    await browser.waitUntil(() => this.getElement().isDisplayed().then(d => !d));
  }

}
