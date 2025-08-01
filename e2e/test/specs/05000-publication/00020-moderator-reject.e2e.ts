import { App } from '../../app/app';
import { TrailsPage, TrailsPageType } from '../../app/pages/trails-page';

describe('Publication - Moderator Reject', () => {

  it('Login as admin, reject publication', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection(App.config.adminUsername, App.config.adminPassword);
    const menu = await App.openMenu();
    await menu.openModerationTrails();
    const trailsPage = new TrailsPage(TrailsPageType.MODERATION);
    await trailsPage.waitDisplayed();
    const trailsList = await trailsPage.trailsAndMap.openTrailsList();
    const trail = await trailsList.waitTrail('Randonnée du 05/06/2023 à 08:58');
    const trailPage = await trailsList.openTrail(trail);
    await trailPage.trailComponent.openDetails();
    const messageElement = trailPage.trailComponent.getElement().$('div.author-message');
    await messageElement.waitForDisplayed();
    expect(await messageElement.getText()).toBe('Hello');
    await trailPage.trailComponent.rejectPublication('Try again please');
    await new TrailsPage(TrailsPageType.MODERATION).waitDisplayed();
    await App.logout();
  });

  it('End', async () => await App.end());

});
