import { App } from '../../app/app';
import { loginAsAdmin, createUser } from '../../../scripts/create_user';
import { TrailPage } from '../../app/pages/trail-page';

describe('Publication - Another user can search and comment', () => {

  it('Create another user', async () => {
    App.init();
    const adminToken = await loginAsAdmin(App.config.adminUsername!, App.config.adminPassword!);
    await createUser(adminToken, 'another_user_05000@trailence.org', '12345678');
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
  });

  it('End', async () => {
    await App.logout(false);
    await App.end();
  });

});
