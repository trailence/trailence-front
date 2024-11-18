import { App } from '../app/app';
import { Component } from './component';
import { IonicButton } from './ionic/ion-button';
import { MenuContent } from './menu-content.component';

export class TrailOverview extends Component {

  public async getTrailName() {
    const nameDiv = this.getElement().$('div.trail-name');
    return await nameDiv.getText();
  }

  public async getTags() {
    const row = this.getElement().$('div.trail-tags-row');
    const elements = row.$$('div.tag');
    const tags = [];
    for (const element of await elements.getElements()) {
      tags.push(await element.getText());
    }
    return tags;
  }

  public async clickMenuItem(item: string) {
    const button = new IonicButton(this.getElement().$('div.trail-name-row ion-button.trail-menu-button'));
    await button.click();
    const menu = new MenuContent(await App.waitPopover());
    await menu.clickItemWithText(item);
  }

}
