import { App } from '../../app/app';
import { CommentsModeration } from '../../components/comments-moderation.page';

describe('Publication - Moderator can check the comment', () => {

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
  });

  it('End', async () => {
    await App.logout(false);
    await App.end();
  });

});
