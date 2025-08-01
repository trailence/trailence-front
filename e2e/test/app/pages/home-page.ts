import { Page } from './page';
import { TrailsPage, TrailsPageType } from './trails-page';

export class HomePage extends Page {
  constructor() {
    super('home');
  }

  protected override expectedUrl(url: string): boolean {
    return url.indexOf('/home') > 0;
  }

  public async goToSearch() {
    await this.getElement().$('a.home-page-search-route-button').click();
    const trailsPage = new TrailsPage(TrailsPageType.PUBLIC_SEARCH);
    await trailsPage.waitDisplayed();
    return trailsPage;
  }
}
