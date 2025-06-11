import { App } from '../app/app';
import { Page, PageWithHeader } from '../app/pages/page';
import { TestUtils } from '../utils/test-utils';
import { AppMenu } from './app-menu.component';
import { Component } from './component';
import { IonicButton } from './ionic/ion-button';
import { MenuContent } from './menu-content.component';
import { ModalComponent } from './modal';
import { ChainablePromiseElement } from 'webdriverio';
import { Key } from 'webdriverio';

export class HeaderComponent extends Component {

  constructor(
    parent: PageWithHeader | ChainablePromiseElement,
  ) {
    super(parent, 'app-header');
  }

  public async getTitle() {
    try {
      return await this.getElement().$('div.header-title div.title-text').getText();
    } catch (e) {
      return '';
    }
  }

  public async openUserMenu() {
    const alreadyOpen = App.getPopoverContainer();
    if (await alreadyOpen.isExisting() && await alreadyOpen.isDisplayed()) {
      const popover = App.getPopoverContent(alreadyOpen);
      try {
        if (await popover.$('ion-list ion-item#item-synchro').isDisplayed()) {
          return new UserMenu(popover, 'ion-list');
        }
      } catch (e) {
        // continue
      }
    }
    const popover = await TestUtils.retry(async () => {
      const menu = new IonicButton(this.getElement().$('ion-buttons[slot=end] app-header-user-menu ion-button.user-button'));
      await menu.click();
      return await App.waitPopover(10000);
    }, 3, 100);
    expect(popover).toBeDefined();
    const userMenu = new UserMenu(popover, 'ion-list');
    await userMenu.waitDisplayed();
    return userMenu;
  }

  public async openAppMenu() {
    const button = new IonicButton(this, 'ion-menu-button');
    await button.click();
    const menu = $('app-root ion-menu').$('>>>app-menu');
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
    await this.clickByLabel('Sign out');
    const modal = await App.waitModal();
    const logoutModal = new LogoutModal(modal);
    await logoutModal.getElement().waitForDisplayed();
    return logoutModal;
  }

  public async clickMyAccount() {
    return await this.clickByLabel('My Account');
  }

  public async clickByLabel(text: string) {
    const label = this.getElement().$('ion-label=' + text);
    await label.waitForDisplayed();
    await label.click();
  }

  public async clickByIcon(iconName: string) {
    const icon = this.getElement().$('ion-icon[name=' + iconName + ']');
    await icon.waitForDisplayed();
    await icon.click();
  }

  public async getUser() {
    const item = this.getElement().$('>>>ion-item#item-user');
    return (await item.getText()).trim();
  }

  public async close() {
    await TestUtils.retry(async (trial) => {
      if ((trial % 2) === 1)
        await browser.action('pointer').move({x: trial, y: trial, origin: 'viewport'}).pause(100).down().pause(100).up().perform();
      else
        await browser.action('key').down(Key.Escape).pause(50).up(Key.Escape).perform();
      await browser.waitUntil(() => this.getElement().isDisplayed().then(e => !e), { timeout: 2000 });
      await App.waitNoPopover({ timeout: 2000 });
    }, 10, 500);
  }

  public async synchronizeLocalChanges(trial: number = 0, alreadyClickOnSynchronizeNow: boolean = false) {
    const item = this.getElement().$('>>>ion-item#item-synchro');
    const localChanges = item.$('>>>.synchro>.value:last-child');
    let result = false;
    for (; trial <= 10; ++trial) {
      try {
        const text = await localChanges.getText();
        if (text === 'No') {
          result = true;
          break;
        }
        if (text === 'Yes') {
          if (alreadyClickOnSynchronizeNow) {
            try {
              await browser.waitUntil(() => localChanges.getText().then(text => text === 'No'), { timeout: 10000 });
              result = true;
              break;
            } catch (e) {
              await this.close();
              const page = await Page.getActivePageElement();
              const header = new HeaderComponent(page);
              await header.waitDisplayed();
              const menu = await header.openUserMenu();
              await menu.synchronizeLocalChanges(trial + 1, false);
              return;
            }
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
          await menu.synchronizeLocalChanges(trial + 1, true);
          return;
        }
      } catch (e) {
        // continue
      }
    }
    expect(result).withContext('Synchro after ' + trial + ' trials').toBeTrue();
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
