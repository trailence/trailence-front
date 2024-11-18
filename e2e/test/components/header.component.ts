import { App } from '../app/app';
import { Page, PageWithHeader } from '../app/pages/page';
import { AppMenu } from './app-menu.component';
import { Component } from './component';
import { IonicButton } from './ionic/ion-button';
import { MenuContent } from './menu-content.component';
import { ModalComponent } from './modal';

export class HeaderComponent extends Component {

  constructor(
    parent: PageWithHeader | ChainablePromiseElement,
  ) {
    super(parent, 'app-header');
  }

  public async getTitle() {
    return await this.getElement().$('div.header-title div.title-text').getText();
  }

  public async openUserMenu() {
    const alreadyOpen = App.getPopoverContainer();
    if (await alreadyOpen.isExisting() && await alreadyOpen.isDisplayed()) {
      const popover = App.getPopoverContent(alreadyOpen);
      if (await popover.$('ion-list ion-item#item-synchro').isDisplayed()) {
        return new UserMenu(popover, 'ion-list');
      }
    }
    const menu = new IonicButton(this.getElement().$('ion-buttons[slot=end] app-header-user-menu ion-button.user-button'));
    await menu.click();
    const popover = await App.waitPopover();
    const userMenu = new UserMenu(popover, 'ion-list');
    await userMenu.waitDisplayed();
    return userMenu;
  }

  public async openAppMenu() {
    const button = new IonicButton(this, 'ion-menu-button');
    await button.click();
    const menu = $('app-root ion-menu app-menu');
    await menu.waitForDisplayed();
    await browser.waitUntil(() => menu.getCSSProperty('width').then(w => w.value === '304px'));
    return new AppMenu(menu);
  }

  public async openActionsMenu() {
    const button = new IonicButton(this, '.header-title .title-actions ion-button');
    await button.click();
    const popover = await App.waitPopover();
    const menu = new MenuContent(popover, '>>>app-menu-content');
    await menu.waitDisplayed();
    return menu;
  }

  public async goBack() {
    const button = new IonicButton(this, '.header-title .back-button ion-button');
    await button.click();
  }

}

export class UserMenu extends Component {

  public async clickLogout() {
    const label = this.getElement().$('ion-label=Sign out');
    await label.waitForDisplayed();
    await label.click();
    const modal = await App.waitModal();
    const logoutModal = new LogoutModal(modal);
    await logoutModal.getElement().waitForDisplayed();
    return logoutModal;
  }

  public async synchronizeLocalChanges(trial: number = 0, alreadyClickOnSynchronizeNow: boolean = false) {
    const item = this.getElement().$('>>>ion-item#item-synchro');
    const localChanges = item.$('>>>.synchro>.value:last-child');
    let result = false;
    for (let i = trial; i < 10; ++i) {
      try {
        const text = await localChanges.getText();
        if (text === 'No') {
          result = true;
          break;
        }
        if (text === 'Yes') {
          if (i === 9) throw new Error('Still has local changes after 10 trials');
          if (alreadyClickOnSynchronizeNow) {
            browser.waitUntil(() => localChanges.getText().then(text => text === 'No'));
            result = true;
            break;
          }
          await item.click();
          const popover = $('ion-app>ion-popover:not(.overlay-hidden).popover-nested');
          await popover.waitForDisplayed();
          const viewport = popover.$('>>>div.popover-viewport');
          await viewport.waitForExist();
          const syncItem = viewport.$('>>>ion-list ion-item:first-child');
          await syncItem.waitForDisplayed();
          await syncItem.click();
          await browser.waitUntil(() => App.getPopoverContainer().isDisplayed().then(d => !d));
          const page = await Page.getActivePageElement();
          const header = new HeaderComponent(page);
          await header.waitDisplayed();
          const menu = await header.openUserMenu();
          await menu.synchronizeLocalChanges(i + 1, true);
          return;
        }
      } catch (e) {
        if (i === 9) throw e;
      }
    }
    expect(result).toBeTrue();
  }

}

export class LogoutModal extends ModalComponent {

  public async clickKeepData() {
    const button = await this.getFooterButtonWithText('Keep');
    await button.click();
    await browser.waitUntil(() => this.notDisplayed());
  }

  public async clickDelete() {
    const button = await this.getFooterButtonWithText('Delete');
    await button.click();
    await browser.waitUntil(() => this.notDisplayed());
  }

}
