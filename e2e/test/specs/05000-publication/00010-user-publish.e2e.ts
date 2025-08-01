import { App } from '../../app/app';
import { TrailPage } from '../../app/pages/trail-page';
import { ModalComponent } from '../../components/modal';

describe('Publication - User Publish', () => {

  it('Login, create collection, import gpx, start publication', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    const collectionPage = await menu.addCollection('Test Publication');
    expect(await collectionPage.header.getTitle()).toBe('Test Publication');
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    await trailsList.importFile('./test/assets/gpx-001.gpx');
    const trail = await trailsList.waitTrail('Randonnée du 05/06/2023 à 08:58');
    await trail.clickMenuItemWithIcon('web');
    const modal = new ModalComponent(await App.waitModal());
    await (await modal.getFooterButtonWithColor('success')).click();
    await modal.waitNotDisplayed();
  });

  it('Publish trail', async () => {
    const trailPage = await TrailPage.waitForOpen();
    await trailPage.trailComponent.setDescription('A trail to publish to test everything is working, but unfortunately it will be rejected the first time, then accepted.')
    await trailPage.trailComponent.setLocation();
    await trailPage.trailComponent.setActivity('hiking');
    const checklist = await trailPage.trailComponent.openPublicationCheckList();
    await checklist.checkAll();
    await (await checklist.getFooterButtonWithText('Close')).click();
    await checklist.waitNotDisplayed();
    await trailPage.trailComponent.publishDraft('Hello');
  });

  it('Synchronize and logout', async () => {
    await App.synchronize(true);
  });

  it('End', async () => await App.end());

});
