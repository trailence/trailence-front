import { expect } from '@wdio/globals'
import { App } from '../../app/app';
import { LoginPage } from '../../app/pages/login-page';
import { TrailsPage } from '../../app/pages/trails-page';
import { HeaderComponent } from '../../components/header.component';
import { Page } from '../../app/pages/page';

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
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My trails'));
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
    expect(await myTrailsPage.header.getTitle()).toBe('My trails');
    await browser.url('https://github.com/trailence');
    await browser.waitUntil(() => browser.getTitle().then(title => title === 'Trailence · GitHub'));
    await browser.pause(2500); // else sometimes the geckodriver crashes
    await browser.url(browser.options.baseUrl!);
    myTrailsPage = new TrailsPage();
    await myTrailsPage.waitDisplayed();
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My trails'));
  });

  it('Logout', async () => await App.logout(false));

  it('Login with redirect on preferences', async () => {
    const loginPage = await App.start('/preferences');
    await loginPage.login();
    expect(await new HeaderComponent(await Page.getActivePageElement()).getTitle()).toBe('Preferences');
    await App.logout(false);
  });

  it('Login with redirect to an unknown collection, end up to My trails', async () => {
    const loginPage = await App.start('/trails/collection/00000000-0000-0000-0000-000000000000');
    await loginPage.login();
    await browser.waitUntil(() => browser.getTitle().then(title => title === 'My trails - Trailence'));
    await App.logout(false);
  });

  it('Login with redirect to an unknown share, end up to My trails', async () => {
    const loginPage = await App.start('/trails/share/00000000-0000-0000-0000-000000000000/me@trailence.org');
    await loginPage.login();
    await browser.waitUntil(() => browser.getTitle().then(title => title === 'My trails - Trailence'));
    await App.logout(false);
  });

  it('Login with redirect to an unknown trail, end up to My trails', async () => {
    const loginPage = await App.start('/trail/me@trailence.org/00000000-0000-0000-0000-000000000000');
    await loginPage.login();
    await browser.waitUntil(() => browser.getTitle().then(title => title === 'My trails - Trailence'));
    await App.logout(false);
  });

  it('End', async () => {
    await App.end();
  });

});
