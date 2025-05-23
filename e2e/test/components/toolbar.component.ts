import { App } from '../app/app';
import { TestUtils } from '../utils/test-utils';
import { Component } from './component';
import { MenuContent } from './menu-content.component';

export class ToolbarComponent extends Component {

  public getButtonByIcon(icon: string) {
    return this.getElement().$('div.toolbar-item ion-icon[name=' + icon + ']');
  }

  public async clickByIcon(icon: string) {
    await this.getButtonByIcon(icon).click();
  }

  public async clickByIconAndGetMenu(icon: string) {
    await this.clickByIcon(icon);
    return await TestUtils.retry(async () => {
      const popover = await App.waitPopover(10000);
      const menu = new MenuContent(popover);
      await menu.waitDisplayed(false, 5000);
      return menu;
    }, 3, 1000);
  }

  public async moreMenu() {
    return await this.clickByIconAndGetMenu('more-menu');
  }

}
