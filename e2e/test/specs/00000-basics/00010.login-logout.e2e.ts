import { expect } from '@wdio/globals'
import { App } from '../../app/app';
import { LoginPage } from '../../app/pages/login-page';
import { TrailsPage } from '../../app/pages/trails-page';

describe('Login and Logout', () => {

  it('Check app config', () => {
    App.init();
  });

  let loginPage: LoginPage;

  it('When starting, the login page is displayed', async () => {
    loginPage = await App.start();
    await browser.waitUntil(async () => await loginPage.loginInput.isDisplayed());
  });

  let myTrailsPage: TrailsPage;

  it('Login as init user', async () => {
    myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    expect(await myTrailsPage.header.getTitle()).toBe('My Trails');
  });

  it('Logout', async () => {
    const userMenu = await myTrailsPage.header.openUserMenu();
    expect(await userMenu.isDisplayed()).toBeTrue();
    const logoutPopup = await userMenu.clickLogout();
    expect(await logoutPopup.getTitle()).toBe('Sign out');
    await logoutPopup.clickKeepData();
    loginPage = new LoginPage();
    await loginPage.waitDisplayed();
  });

})
