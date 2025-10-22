import { App } from '../../app/app';
import { TrailsPage, TrailsPageType } from '../../app/pages/trails-page';
import { IonicInput } from '../../components/ionic/ion-input';
import { IonicTextArea } from '../../components/ionic/ion-textarea';
import { ModerationTranslationsComponent } from '../../components/moderation-translations.component';

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
    const translations = new ModerationTranslationsComponent(trailPage.trailComponent.getElement().$('app-moderation-translations'));
    await translations.waitDisplayedAndOpen();
    await translations.setSourceLang('fr');
    await translations.setTrailName('This trail is translated');
    await translations.setTrailDescription('This description is translated');
    await trailPage.trailComponent.acceptPublication();
    await App.logout(false);
  });

  it('End', async () => await App.end());

});
