import { App } from '../../app/app';
import { LoginPage } from '../../app/pages/login-page';
import { Page } from '../../app/pages/page';
import { AppMenu } from '../../components/app-menu.component';
import { HeaderComponent } from '../../components/header.component';
import { ShareModal } from '../../components/share.modal';
import { FilesUtils } from '../../utils/files-utils';
import { checkShares } from './share-utils';

describe('Shares - Edit', () => {

  let loginPage: LoginPage;

  it('Open link, remove share', async () => {
    App.init();
    const linkUrl = await FilesUtils.fs().then(fs => fs.readFileSync(App.config.downloadPath + '/share3.link', {encoding: 'utf-8'}));
    const page = await App.startLink(linkUrl);
    await browser.waitUntil(() => page.header.getTitle().then(title => title === 'tag2+4+photo'));

    const appMenu = await App.openMenu();
    const shares = await appMenu.getShares(appMenu.getSharedWithMeSection());
    expect(shares.length).toBe(1);
    expect(shares[0][0]).toBe('tag2+4+photo');
    expect(shares[0][1]).toBe(App.config.username);
    await appMenu.close();

    const shareMenu = await page.header.openActionsMenu();
    await shareMenu.clickItemWithText('Delete');
    const alert = await App.waitAlert();
    await alert.clickButtonWithRole('danger');
    await browser.waitUntil(() => Page.getActivePageElement().then(p => new HeaderComponent(p).getTitle()).then(t => t === 'My Trails'));
    await App.synchronize();
    loginPage = await App.logout();
  });

  let appMenu: AppMenu;

  it('User see the share has been deleted', async () => {
    await loginPage.loginAndWaitMyTrailsCollection();
    appMenu = await App.openMenu();
    const shares = await appMenu.getShares(appMenu.getSharedByMeSection());
    expect(shares.find(s => s[1] === 'friend3@trailence.org')).toBeUndefined();
  });

  it('Edit share with friend1, rename it and share it with friend 2', async () => {
    const shareMenu = await appMenu.openShareMenu(appMenu.getSharedByMeSection(), 'full col');
    expect(shareMenu).toBeDefined();
    await shareMenu!.clickItemWithText('Edit');
    const modal = new ShareModal(await App.waitModal());
    await modal.setShareName('full col edited');
    await modal.addEmail('friend2@trailence.org');
    await modal.save();
  });

  it('Share is updated in app menu', async () => {
    const menu = await App.openMenu();
    const expected = [
      ['full col edited', 'friend1@trailence.org +1'],
      ['tag2 nophoto', 'friend2@trailence.org'],
      ['2trails', 'friend4@trailence.org']
    ];
    await checkShares(menu, true, expected);
    await menu.close();
  });

  it('Synchronize and logout', async () => {
    await App.synchronize();
    await App.logout();
  });

  it('Friend 1 can see the new name', async () => {
    const link = await FilesUtils.fs().then(fs => fs.readFileSync(App.config.downloadPath + '/share1.link', 'utf8') as string);
    await App.openLink(link);
    const menu = await App.openMenu();
    const expected = [
      ['full col edited', App.config.username],
    ];
    await checkShares(menu, false, expected);
    await menu.close();
    await App.logout();
  });

  it('Friend 2 can see the new share', async () => {
    const link = await FilesUtils.fs().then(fs => fs.readFileSync(App.config.downloadPath + '/share2.link', 'utf8') as string);
    await App.openLink(link);
    const menu = await App.openMenu();
    const expected = [
      ['full col edited', App.config.username],
      ['tag2 nophoto', App.config.username],
    ];
    await checkShares(menu, false, expected);
    await menu.close();
    await App.logout();
  });

  it('End', async () => await App.end());
});
