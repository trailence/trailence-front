import { App } from '../../app/app';
import { ShareModal } from '../../components/share.modal';
import { FilesUtils } from '../../utils/files-utils';
import { checkShares } from './share-utils';

describe('Shares - Edit', () => {

  it('Login', async () => {
    App.init();
    const loginPage = await App.start();
    const myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My Trails'));
  });

  it('Edit share with friend1, rename it and share it with friend 2', async () => {
    const menu = await App.openMenu();
    const shareMenu = await menu.openShareMenu(menu.getSharedByMeSection(), 'full col');
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

});
