import { App } from '../../app/app';
import { TestUtils } from '../../utils/test-utils';

describe('Publication - User see published', () => {

  it('As not authenticated user, I can search and find the trail', async () => {
      App.init();
      const homePage = await App.startHome();
      const trailsPage = await homePage.goToSearch();
      await trailsPage.findPublicTrailFromBubblesToPath();
      const trailsList = await trailsPage.trailsAndMap.openTrailsList();
      const trail = await trailsList.waitTrail('Randonnée du 05/06/2023 à 08:58');
      await trailsList.openTrail(trail);
    });

    it('End', async () => await App.end());

});
