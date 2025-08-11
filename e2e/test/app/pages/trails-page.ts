import { TrailsAndMapComponent } from '../../components/trails-and-map.component';
import { TestUtils } from '../../utils/test-utils';
import { App } from '../app';
import { PageWithHeader } from './page';

export enum TrailsPageType {
  COLLECTION,
  SHARE,
  SEARCH,
  MODERATION,
  PUBLIC_SEARCH,
  PUBLISHED,
}

export class TrailsPage extends PageWithHeader {

  constructor(private readonly type: TrailsPageType = TrailsPageType.COLLECTION) {
    super('trails-page');
  }

  public get trailsAndMap() { return new TrailsAndMapComponent(this.getElement().$('app-trails-and-map')); }

  protected override expectedUrl(url: string): boolean {
    switch (this.type) {
      case TrailsPageType.COLLECTION: return url.indexOf('/trails/collection/') > 0 && url.indexOf('/trails/collection/my_trails') < 0;
      case TrailsPageType.SHARE: return url.indexOf('/trails/share/') > 0;
      case TrailsPageType.SEARCH: return url.indexOf('/trails/search') > 0;
      case TrailsPageType.MODERATION: return url.indexOf('/trails/moderation') > 0;
      case TrailsPageType.PUBLIC_SEARCH: return url.indexOf('/search-route') > 0;
      case TrailsPageType.PUBLISHED: return url.indexOf('/trails/my-publications') > 0;
    }
  }

  public async findPublicTrailFromBubblesToPath() {
    await TestUtils.retry(async topTrial => {
      const map = await this.trailsAndMap.openMap();
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
  }

}
