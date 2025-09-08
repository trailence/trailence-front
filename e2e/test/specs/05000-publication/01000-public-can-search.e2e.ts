import { App } from '../../app/app';

describe('Publication - User see published', () => {

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
