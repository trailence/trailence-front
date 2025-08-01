import { App } from '../../app/app';
import { NotificationsPage } from '../../app/pages/notifications.page';
import { TrailsPage, TrailsPageType } from '../../app/pages/trails-page';

describe('Publication - User see published', () => {

  let collectionPage: TrailsPage;

  it('Login, I can see my trail is published', async () => {
      App.init();
      const loginPage = await App.start();
      await loginPage.loginAndWaitMyTrailsCollection();
      let menu = await App.openMenu();
      collectionPage = await menu.openCollection('Test Publication');
      let trailsList = await collectionPage.trailsAndMap.openTrailsList();
      let trail = await trailsList.waitTrail('Randonnée du 05/06/2023 à 08:58');
      await trail.expectIsPublished();
      menu = await App.openMenu();
      await menu.openPublishedTrails();
      collectionPage = new TrailsPage(TrailsPageType.PUBLISHED);
      await collectionPage.waitDisplayed();
      expect(await collectionPage.header.getTitle()).toBe('Published');
      trailsList = await collectionPage.trailsAndMap.openTrailsList();
      await trailsList.waitTrail('Randonnée du 05/06/2023 à 08:58');
    });

    it('Check notifications', async () => {
      const userMenu = await collectionPage.header.openUserMenu();
      await userMenu.clickByIcon('notification');
      const notifPage = new NotificationsPage();
      await notifPage.waitDisplayed();
      await notifPage.expectNotifications(['has been published', 'has been declined']);
    });

    it('Synchronize and logout', async () => {
      await App.synchronize(true);
    });

    it('End', async () => await App.end());

});
