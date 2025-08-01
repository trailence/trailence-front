import { App } from '../../app/app';
import { TrailsPage } from '../../app/pages/trails-page';

describe('Publication - User Publish', () => {

  it('Login, go to rejected publications, publish again', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    await menu.openRejectedPublications();
    const collectionPage = new TrailsPage();
    await collectionPage.waitDisplayed();
    expect(await collectionPage.header.getTitle()).toBe('Changes requested');
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    const trailPage = await trailsList.openTrailByName('Randonnée du 05/06/2023 à 08:58');
    await trailPage.trailComponent.openDetails();
    const messageElement = trailPage.trailComponent.getElement().$('div.moderator-message');
    await messageElement.waitForDisplayed();
    expect(await messageElement.getText()).toBe('Try again please');
    await trailPage.trailComponent.improvePublication();
    const checklist = await trailPage.trailComponent.openPublicationCheckList();
    await checklist.checkAll();
    await (await checklist.getFooterButtonWithText('Close')).click();
    await checklist.waitNotDisplayed();
    await trailPage.trailComponent.publishDraft('Please accept');
  });

  it('Synchronize and logout', async () => {
    await App.synchronize(true);
  });

  it('End', async () => await App.end());

});
