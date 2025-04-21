import { App } from '../../app/app';
import { Page } from '../../app/pages/page';
import { HeaderComponent } from '../../components/header.component';

describe('Login with redirects', () => {

  it('Login with redirect on preferences', async () => {
    App.init();
    const loginPage = await App.start('/preferences');
    await loginPage.login();
    expect(await new HeaderComponent(await Page.getActivePageElement()).getTitle()).toBe('Preferences');
    await App.logout();
  });

  it('Login with redirect to an unknown collection, end up to My Trails', async () => {
    App.init();
    const loginPage = await App.start('/trails/collection/00000000-0000-0000-0000-000000000000');
    await loginPage.login();
    await browser.waitUntil(() => browser.getTitle().then(title => title === 'My Trails - Trailence'));
    await App.logout();
  });

  it('Login with redirect to an unknown share, end up to My Trails', async () => {
    App.init();
    const loginPage = await App.start('/trails/share/00000000-0000-0000-0000-000000000000/me@trailence.org');
    await loginPage.login();
    await browser.waitUntil(() => browser.getTitle().then(title => title === 'My Trails - Trailence'));
    await App.logout();
  });

  it('Login with redirect to an unknown trail, end up to My Trails', async () => {
    App.init();
    const loginPage = await App.start('/trail/me@trailence.org/00000000-0000-0000-0000-000000000000');
    await loginPage.login();
    await browser.waitUntil(() => browser.getTitle().then(title => title === 'My Trails - Trailence'));
    await App.logout();
  });

  it('End', async () => await App.end());

});
