import { App } from '../../app/app';
import { LoginPage } from '../../app/pages/login-page';
import { Page } from '../../app/pages/page';
import { TrailsPage } from '../../app/pages/trails-page';
import { AppMenu } from '../../components/app-menu.component';
import { HeaderComponent } from '../../components/header.component';
import { ShareModal } from '../../components/share.modal';
import { importTrails } from '../../utils/import-trails';
import { MailHog } from '../../utils/mailhog';
import { checkShares } from './share-utils';

describe('Shares', () => {

  let collectionPage: TrailsPage;

  it('Login, create collection, and import trails', async () => {
    App.init();
    await App.startLoginIfNeeded();
    const menu = await App.openMenu();
    collectionPage = await menu.addCollection('Test Shares');
    expect(await collectionPage.header.getTitle()).toBe('Test Shares');
    await importTrails(collectionPage, ['gpx-001.gpx', 'gpx-002.gpx', 'gpx-003.gpx', 'gpx-004.gpx', 'gpx-zip-002.zip']);
  });

  it('Share full collection to friend1 without photos', async () => {
    (await collectionPage.header.openActionsMenu()).clickItemWithIcon('share');
    const modal = new ShareModal(await App.waitModal());
    await modal.shareWholeCollection();
    await modal.setShareName('full col');
    await modal.addEmail('friend1@trailence.org');
    await modal.save();
  });

  it('Share Tag 2 to friend2 without photos to friend2', async () => {
    (await collectionPage.header.openActionsMenu()).clickItemWithIcon('share');
    const modal = new ShareModal(await App.waitModal());
    await modal.shareTags();
    await modal.selectTags(['Tag 2']);
    await modal.setShareName('tag2 nophoto');
    await modal.addEmail('friend2@trailence.org');
    await modal.save();
  });

  it('Share Tag2 and Tag 4 with photos to friend3', async () => {
    (await collectionPage.header.openActionsMenu()).clickItemWithIcon('share');
    const modal = new ShareModal(await App.waitModal());
    await modal.shareTags();
    await modal.selectTags(['Tag 2', 'Tag 4']);
    await modal.setShareName('tag2+4+photo');
    await modal.addEmail('friend3@trailence.org');
    await modal.selectIncludePhotos();
    await modal.save();
  });

  it('Share Tour de Port-Cros and Randonnée du 05/06/2023 à 08:58 to friend4', async () => {
    const list = await collectionPage.trailsAndMap.openTrailsList();
    expect(await list.getNbSelected()).toBe(0);
    let trail = await list.findItemByTrailName('Tour de Port-Cros');
    expect(trail).toBeDefined();
    await list.ensureSelected(trail!);
    trail = await list.findItemByTrailName('Randonnée du 05/06/2023 à 08:58');
    expect(trail).toBeDefined();
    await list.ensureSelected(trail!);
    expect(await list.getNbSelected()).toBe(2);
    await list.selectionMenuWithIcon('share');
    const modal = new ShareModal(await App.waitModal());
    await modal.setShareName('2trails');
    await modal.addEmail('friend4@trailence.org');
    await modal.save();
  });

  it('Synchronize', async () => {
    await App.synchronize();
  });

  it('All shares are present in app menu', async () => {
    const menu = await App.openMenu();
    const expected = [
      ['full col', 'friend1@trailence.org'],
      ['tag2 nophoto', 'friend2@trailence.org'],
      ['tag2+4+photo', 'friend3@trailence.org'],
      ['2trails', 'friend4@trailence.org']
    ];
    await checkShares(menu, true, expected);
    await menu.close();
    await App.logout(false);
  });

  let link1: string;
  let link2: string;
  let link3: string;
  let link4: string;

  it('Retrieve links from mails', async () => {
    App.init();
    const mh = new MailHog();
    await mh.open();
    let msg = await mh.openMessageTo('friend1@trailence.org');
    expect(msg).toBeDefined();
    let i = msg!.indexOf('<a href="');
    expect(i).toBeGreaterThan(0);
    let j = msg!.indexOf('"', i + 9);
    let link = msg!.substring(i + 9, j);
    expect(link.startsWith('https://trailence.org/link/')).toBeTrue();
    link1 = link.substring(27);
    await mh.deleteMessage();

    msg = await mh.openMessageTo('friend2@trailence.org');
    expect(msg).toBeDefined();
    i = msg!.indexOf('<a href="');
    expect(i).toBeGreaterThan(0);
    j = msg!.indexOf('"', i + 9);
    link = msg!.substring(i + 9, j);
    expect(link.startsWith('https://trailence.org/link/')).toBeTrue();
    link2 = link.substring(27);
    await mh.deleteMessage();

    msg = await mh.openMessageTo('friend3@trailence.org');
    expect(msg).toBeDefined();
    i = msg!.indexOf('<a href="');
    expect(i).toBeGreaterThan(0);
    j = msg!.indexOf('"', i + 9);
    link = msg!.substring(i + 9, j);
    expect(link.startsWith('https://trailence.org/link/')).toBeTrue();
    link3 = link.substring(27);
    await mh.deleteMessage();

    msg = await mh.openMessageTo('friend4@trailence.org');
    expect(msg).toBeDefined();
    i = msg!.indexOf('<a href="');
    expect(i).toBeGreaterThan(0);
    j = msg!.indexOf('"', i + 9);
    link = msg!.substring(i + 9, j);
    expect(link.startsWith('https://trailence.org/link/')).toBeTrue();
    link4 = link.substring(27);
    await mh.deleteMessage();
  });

  it('Check share 1', async () => {
    const page = await App.openLink(link1);
    await browser.waitUntil(() => page.header.getTitle().then(title => title === 'full col'));
    const menu = await page.header.openUserMenu();
    expect(await menu.getUser()).toBe('friend1@trailence.org');
    await menu.close();

    const appMenu = await App.openMenu();
    expect(await appMenu.hasAdmin()).toBeFalse();
    await appMenu.close();

    const list = await page.trailsAndMap.openTrailsList();
    await browser.waitUntil(() => list.items.length.then(nb => nb === 5));
    const trails = await list.getTrailsNames();
    expect(trails).toContain('Tour de Port-Cros');
    expect(trails).toContain('Roquefraîche');
    expect(trails).toContain('Au dessus de Montclar');
    expect(trails).toContain('Col et lacs de la Cayolle');
    expect(trails).toContain('Randonnée du 05/06/2023 à 08:58');
    expect(trails).toHaveSize(5);

    const trail = await list.findItemByTrailName('Col et lacs de la Cayolle');
    expect(trail).toBeDefined();
    await trail!.expectNoPhotos();
  });

  it('Check share 2', async () => {
    const page = await App.openLink(link2);
    await browser.waitUntil(() => page.header.getTitle().then(title => title === 'tag2 nophoto'));
    const menu = await page.header.openUserMenu();
    expect(await menu.getUser()).toBe('friend2@trailence.org');
    await menu.close();
    const list = await page.trailsAndMap.openTrailsList();
    await browser.waitUntil(() => list.items.length.then(nb => nb === 3));
    const trails = await list.getTrailsNames();
    expect(trails).toContain('Tour de Port-Cros');
    expect(trails).toContain('Roquefraîche');
    expect(trails).toContain('Col et lacs de la Cayolle');
    expect(trails).toHaveSize(3);

    const trail = await list.findItemByTrailName('Col et lacs de la Cayolle');
    expect(trail).toBeDefined();
    await trail!.expectNoPhotos();
  });

  it('Check share 3', async () => {
    const page = await App.openLink(link3);
    await browser.waitUntil(() => page.header.getTitle().then(title => title === 'tag2+4+photo'));
    const menu = await page.header.openUserMenu();
    expect(await menu.getUser()).toBe('friend3@trailence.org');
    await menu.close();
    const list = await page.trailsAndMap.openTrailsList();
    await browser.waitUntil(() => list.items.length.then(nb => nb === 4));
    const trails = await list.getTrailsNames();
    expect(trails).toContain('Tour de Port-Cros');
    expect(trails).toContain('Roquefraîche');
    expect(trails).toContain('Au dessus de Montclar');
    expect(trails).toContain('Col et lacs de la Cayolle');
    expect(trails).toHaveSize(4);

    const trail = await list.findItemByTrailName('Col et lacs de la Cayolle');
    expect(trail).toBeDefined();
    await trail!.expectPhotos();
  });

  it('Check share 4', async () => {
    const page = await App.openLink(link4);
    await browser.waitUntil(() => page.header.getTitle().then(title => title === '2trails'));
    const menu = await page.header.openUserMenu();
    expect(await menu.getUser()).toBe('friend4@trailence.org');
    await menu.close();
    const list = await page.trailsAndMap.openTrailsList();
    await browser.waitUntil(() => list.items.length.then(nb => nb === 2));
    const trails = await list.getTrailsNames();
    expect(trails).toContain('Tour de Port-Cros');
    expect(trails).toContain('Randonnée du 05/06/2023 à 08:58');
    expect(trails).toHaveSize(2);
  });

  let loginPage: LoginPage;

  it('Open link 3, remove share', async () => {
    const page = await App.startLink(link3);
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
    await browser.waitUntil(() => Page.getActivePageElement().then(p => new HeaderComponent(p).getTitle()).then(t => t === 'My trails'));
    const login = await App.synchronize(true);
    expect(login).toBeDefined();
    if (login)
      loginPage = login;
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
    await App.synchronize(true);
  });

  it('Friend 1 can see the new name', async () => {
    await App.openLink(link1);
    const menu = await App.openMenu();
    const expected = [
      ['full col edited', App.config.username],
    ];
    await checkShares(menu, false, expected);
    await menu.close();
    await App.logout();
  });

  it('Friend 2 can see the new share', async () => {
    await App.openLink(link2);
    const menu = await App.openMenu();
    const expected = [
      ['full col edited', App.config.username],
      ['tag2 nophoto', App.config.username],
    ];
    await checkShares(menu, false, expected);
    await menu.close();
    await App.logout();
  });

  it('End', async () => {
    await App.end();
  });
});
