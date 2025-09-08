import { App } from '../../app/app';
import { NotificationsPage } from '../../app/pages/notifications.page';
import { TrailPage } from '../../app/pages/trail-page';

describe('Publication - User can see the comment on its trail and reply', () => {

  it('Login, I can see the notification, and I can reply to the comment', async () => {
    App.init();
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
  });

  it('End', async () => {
    await App.logout(false);
    await App.end();
  });

});
