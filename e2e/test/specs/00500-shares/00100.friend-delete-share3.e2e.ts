import { App } from '../../app/app';
import { LoginPage } from '../../app/pages/login-page';
import { Page } from '../../app/pages/page';
import { TrailsPage } from '../../app/pages/trails-page';
import { HeaderComponent } from '../../components/header.component';
import { FilesUtils } from '../../utils/files-utils';

describe('Shares - delete by friend', () => {

  let page: TrailsPage;

  it('Open link', async () => {
    App.init();
    const linkUrl = await FilesUtils.fs().then(fs => fs.readFileSync(App.config.downloadPath + '/share3.link', {encoding: 'utf-8'}));
    page = await App.startLink(linkUrl);
    await browser.waitUntil(() => page.header.getTitle().then(title => title === 'tag2+4+photo'));
  });

  let loginPage: LoginPage;

  it('Remove share', async () => {
    const appMenu = await App.openMenu();
    const shares = await appMenu.getShares(appMenu.getSharedWithMeSection());
    expect(shares.length).toBe(1);
    expect(shares[0][0]).toBe('tag2+4+photo');
    expect(shares[0][1]).toBe(App.config.initUsername);
    await appMenu.close();
    const shareMenu = await page.header.openActionsMenu();
    await shareMenu.clickItemWithText('Delete');
    const alert = await App.waitAlert();
    await alert.clickButtonWithRole('danger');
    await browser.waitUntil(() => Page.getActivePageElement().then(p => new HeaderComponent(p).getTitle()).then(t => t === 'My Trails'));
    await App.synchronize();
    loginPage = await App.logout();
  });

  it('User see the share has been deleted', async () => {
    await loginPage.loginAndWaitMyTrailsCollection();
    const appMenu = await App.openMenu();
    const shares = await appMenu.getShares(appMenu.getSharedByMeSection());
    expect(shares.find(s => s[1] === 'friend3@trailence.org')).toBeUndefined();
  });

});
