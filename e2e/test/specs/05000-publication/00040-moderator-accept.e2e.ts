import { App } from '../../app/app';
import { TrailsPage, TrailsPageType } from '../../app/pages/trails-page';
import { IonicInput } from '../../components/ionic/ion-input';
import { IonicTextArea } from '../../components/ionic/ion-textarea';

describe('Publication - Moderator Accept', () => {

  it('Login as admin, accept publication', async () => {
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
    let messageElement = trailPage.trailComponent.getElement().$('div.author-message');
    await messageElement.waitForDisplayed();
    expect(await messageElement.getText()).toBe('Please accept');
    messageElement = trailPage.trailComponent.getElement().$('div.moderator-message');
    await messageElement.waitForDisplayed();
    expect(await messageElement.getText()).toBe('Try again please');
    await trailPage.trailComponent.getElement().$('div.source-lang select').selectByAttribute('value', 'fr');
    const nameInput = new IonicInput(trailPage.trailComponent.getElement().$('app-moderation-translations ion-input'));
    const descriptionInput = new IonicTextArea(trailPage.trailComponent.getElement().$('app-moderation-translations ion-textarea'));
    await nameInput.waitDisplayed();
    await nameInput.setValue('This trail is translated');
    await descriptionInput.setValue('This description is translated');
    await trailPage.trailComponent.acceptPublication();
    await App.logout(false);
  });

  it('End', async () => await App.end());

});
