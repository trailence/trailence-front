import { App } from '../../app/app';
import { TrailsPage } from '../../app/pages/trails-page';
import { ShareModal } from '../../components/share.modal';
import { importAllTrailsToCollection } from '../../utils/import-trails';
import { checkShares } from './share-utils';

describe('Shares - Create', () => {

  let collectionPage: TrailsPage;

  it('Login, create collection, and import trails', async () => {
    App.init();
    const loginPage = await App.start();
    const myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My Trails'));
    const menu = await App.openMenu();
    collectionPage = await menu.addCollection('Test Shares');
    expect(await collectionPage.header.getTitle()).toBe('Test Shares');
    await importAllTrailsToCollection(collectionPage);
  });

  it('Share full collection to friend1 without photos', async () => {
    const list = await collectionPage.trailsAndMap.openTrailsList();
    await(await list.getToolbarButton('share')).click();
    const modal = new ShareModal(await App.waitModal());
    await modal.shareWholeCollection();
    await modal.setShareName('full col');
    await modal.addEmail('friend1@trailence.org');
    await modal.save();
  });

  it('Share Tag 2 to friend2 without photos to friend2', async () => {
    const list = await collectionPage.trailsAndMap.openTrailsList();
    await(await list.getToolbarButton('share')).click();
    const modal = new ShareModal(await App.waitModal());
    await modal.shareTags();
    await modal.selectTags(['Tag 2']);
    await modal.setShareName('tag2 nophoto');
    await modal.addEmail('friend2@trailence.org');
    await modal.save();
  });

  it('Share Tag2 and Tag 4 with photos to friend3', async () => {
    const list = await collectionPage.trailsAndMap.openTrailsList();
    await(await list.getToolbarButton('share')).click();
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
    let trail = await list.findItemByTrailName('Tour de Port-Cros');
    expect(trail).toBeDefined();
    await trail!.selectTrail();
    trail = await list.findItemByTrailName('Randonnée du 05/06/2023 à 08:58');
    expect(trail).toBeDefined();
    await trail!.selectTrail();
    await list.selectionMenu('Share');
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
  });

});
