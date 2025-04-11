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
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My Trails'));
    const userMenu = await myTrailsPage.header.openUserMenu();
    expect(await userMenu.getUser()).toBe(App.config.username);
    await userMenu.close();
  });

  it('Logout', async () => {
    const userMenu = await myTrailsPage.header.openUserMenu();
    expect(await userMenu.isDisplayed()).toBeTrue();
    expect(await userMenu.getUser()).toBe(App.config.username);
    const logoutPopup = await userMenu.clickLogout();
    expect(await logoutPopup.getTitle()).toBe('Sign out');
    await logoutPopup.clickKeepData();
    loginPage = new LoginPage();
    await loginPage.waitDisplayed();
  });

  it('Login again, go somewhere else, come back, still logged in', async () => {
    myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    expect(await myTrailsPage.header.getTitle()).toBe('My Trails');
    await browser.url('https://github.com/trailence');
    await browser.waitUntil(() => browser.getTitle().then(title => title === 'Trailence · GitHub'));
    await browser.pause(2500); // else sometimes the geckodriver crashes
    await browser.url(browser.options.baseUrl!);
    myTrailsPage = new TrailsPage();
    await myTrailsPage.waitDisplayed();
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My Trails'));
  });

  it('End', async () => await App.end());

});
