import { App } from '../../app/app';
import { TestUtils } from '../../utils/test-utils';

describe('Publication - User see published', () => {

  it('As not authenticated user, I can search and find the trail', async () => {
      App.init();
      const homePage = await App.startHome();
      const trailsPage = await homePage.goToSearch();
      await TestUtils.retry(async topTrial => {
        const map = await trailsPage.trailsAndMap.openMap();
        await map.zoomTo(1);
        if (App.config.mode === 'mobile') {
          await TestUtils.retry(async () => {
            const pos = await map.getMapPosition();
            await browser.action('pointer').move(pos.x + 150, pos.y + 150).pause(5).down().pause(5).move(pos.x + 100, pos.y + (topTrial === 1 ? 155 : 145)).pause(5).up().perform();
            await map.topToolbar.clickByIcon('search-map');
            const bubbles = map.getOverlaysSvgsWithClass('bubble');
            await TestUtils.retry(async () => {
              const nb = await bubbles.length;
              if (nb !== 1) throw new Error('Expected 1 bubble, found ' + nb);
            }, 10, 100);
          }, 20, 1);
        } else {
          await map.topToolbar.clickByIcon('search-map');
        }
        do {
          const bubble = await TestUtils.retry(async () => {
            const bubbles = map.getOverlaysSvgsWithClass('bubble');
            const nb = await bubbles.length;
            if (nb !== 1) {
              const paths = map.getAllPaths();
              if (await paths.length === 0)
                throw new Error('Expected 1 bubble, found ' + nb);
              return undefined;
            }
            return bubbles[0];
          }, 20, 200);
          if (!bubble) break;
          await bubble.click();
          await browser.pause(2500); // wait for zoom animation and search again
        } while (await map.getZoom() <= 10);
      }, 2, 100);
      const trailsList = await trailsPage.trailsAndMap.openTrailsList();
      trailsList.waitTrail('Randonnée du 05/06/2023 à 08:58');
    });

    it('End', async () => await App.end());

});
