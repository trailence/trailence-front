import { App } from '../app/app';
import { PageWithHeader } from '../app/pages/page';
import { Component } from './component';
import { ModalComponent } from './modal';

export class HeaderComponent extends Component {

  constructor(
    parent: PageWithHeader,
  ) {
    super(parent, 'app-header');
  }

  public async getTitle() {
    return await this.getElement().$('div.header-title div.title-text').getText();
  }

  public async openUserMenu() {
    const menu = await this.getElement().$('ion-buttons[slot=end] app-header-user-menu');
    await menu.click();
    const popover = await App.waitPopover();
    const userMenu = new UserMenu(popover, 'ion-list');
    await userMenu.waitDisplayed();
    return userMenu;
  }

}

export class UserMenu extends Component {

  public async clickLogout() {
    const label = await this.getElement().$('ion-label=Sign out');
    await label.waitForDisplayed();
    await label.click();
    const modal = await App.waitModal();
    const logoutModal = new LogoutModal(modal);
    await logoutModal.getElement().waitForDisplayed();
    return logoutModal;
  }

}

export class LogoutModal extends ModalComponent {

  public async clickKeepData() {
    const button = await this.getFooterButtonWithText('Keep');
    await button.click();
    await browser.waitUntil(() => this.notDisplayed());
  }

}
