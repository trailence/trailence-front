import { createUser, loginAsAdmin } from '../../../scripts/create_user';
import { App } from '../../app/app';
import { NotificationsPage } from '../../app/pages/notifications.page';
import { TrailPage } from '../../app/pages/trail-page';
import { TrailsPage, TrailsPageType } from '../../app/pages/trails-page';
import { CommentsModeration } from '../../components/comments-moderation.page';
import { Component } from '../../components/component';
import { ModalComponent } from '../../components/modal';
import { ModerationTranslationsComponent } from '../../components/moderation-translations.component';
import { TestUtils } from '../../utils/test-utils';

describe('Publication', () => {

  it('Login, create collection, import gpx, start publication', async () => {
    App.init();
    await App.startLoginIfNeeded();
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
    await trailPage.trailComponent.publishDraft('Hello', true);
  });

  it('Synchronize and logout', async () => {
    await App.synchronize(true);
  });

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

  it('Login as user, go to rejected publications, publish again', async () => {
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
    await trailPage.trailComponent.publishDraft('Please accept', true);
  });

  it('Synchronize and logout', async () => {
    await App.synchronize(true);
  });

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
    await TestUtils.retry(async () => {
      await translations.setTrailName('This trail is translated');
      await translations.setTrailDescription('This description is translated');
      // click outside so the text is taken into account
      await Component.scrollIntoView(messageElement);
      try { await messageElement.click(); } catch (_) {}
      if (!(await trailPage.trailComponent.canAcceptPublication())) throw new Error('Publish button disabled');
    }, 2, 100);
    await trailPage.trailComponent.acceptPublication();
    await App.logout(false);
  });

  let collectionPage: TrailsPage;

  it('Login as user, I can see my trail is published', async () => {
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
    await trailsList.waitTrail('This trail is translated');
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

  let publisherUsername: string;
  let publisherPassword: string;

  it('Create another user', async () => {
    App.init();
    const adminToken = await loginAsAdmin(App.config.adminUsername!, App.config.adminPassword!);
    await createUser(adminToken, 'another_user_05000@trailence.org', '12345678');
    publisherUsername = App.config.username;
    publisherPassword = App.config.password;
    App.config.username = 'another_user_05000@trailence.org';
    App.config.password = '12345678';
  });

  let trailPage: TrailPage;

  it('Login as new user, search public trail', async () => {
    const loginPage = await App.start();
    const myTrails = await loginPage.loginAndWaitMyTrailsCollection();
    const trailsPage = await (await myTrails.header.openAppMenu()).openTrailFinder();
    await trailsPage.findPublicTrailFromBubblesToPath();
    const trailsList = await trailsPage.trailsAndMap.openTrailsList();
    const trail = await trailsList.waitTrail('This trail is translated');
    trailPage = await trailsList.openTrail(trail);
  });

  it('I can rate and comment the trail', async () => {
    const rateAndComments = await trailPage.trailComponent.openComments();
    await rateAndComments.rateAndComment(3, 'This seems to be nice there');
    const comments = rateAndComments.comments;
    expect(await comments.length).toBe(1);
    expect(await rateAndComments.getCommentText(comments[0])).toBe('This seems to be nice there');
    await (await trailPage.header.openAppMenu()).openCollection('My trails');
    await App.logout(false);
  });

  it('Login as publisher, I can see the notification, and I can reply to the comment', async () => {
    App.config.username = publisherUsername;
    App.config.password = publisherPassword;
    const loginPage = await App.start();
    const myTrails = await loginPage.loginAndWaitMyTrailsCollection();

    const userMenu = await myTrails.header.openUserMenu();
    await userMenu.clickByIcon('notification');
    const notifPage = new NotificationsPage();
    await notifPage.waitDisplayed();
    await notifPage.expectAndClickFirstNotificationWithText('Someone rated and commented on your trail');
    const trailPage = await TrailPage.waitForName('This trail is translated');
    const rateAndComments = await trailPage.trailComponent.openComments();
    const comments = rateAndComments.comments;
    expect(await comments.length).toBe(1);
    expect(await rateAndComments.getCommentText(comments[0])).toBe('This seems to be nice there');
    await rateAndComments.replyTo(comments[0], "Indeed, it's nice !");
    await (await trailPage.header.openAppMenu()).openCollection('My trails');
    await App.logout(false);
  });

  it('Login as admin, check comment', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection(App.config.adminUsername, App.config.adminPassword);
    const menu = await App.openMenu();
    await menu.openModerationComments();
    const page = new CommentsModeration();
    await page.waitDisplayed();
    await page.refresh();
    await browser.waitUntil(() => page.trails.length.then(nb => nb === 1));
    const trail = page.trails[0];
    expect(await page.getTrailName(trail)).toBe('Randonnée du 05/06/2023 à 08:58');
    const comments = page.getTrailComments(trail);
    expect(await comments.length).toBe(1);
    await App.logout(false);
  });

  it('As not authenticated user, I can search and find the trail', async () => {
    App.init();
    const homePage = await App.startHome();
    const trailsPage = await homePage.goToSearch();
    await trailsPage.findPublicTrailFromBubblesToPath();
    const trailsList = await trailsPage.trailsAndMap.openTrailsList();
    const trail = await trailsList.waitTrail('This trail is translated');
    await trailsList.openTrail(trail);
  });

  it('End', async () => await App.end());

});
