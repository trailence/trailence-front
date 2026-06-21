import { IonicButton } from '../../components/ionic/ion-button';
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
    const button = new IonicButton(this.getElement().$('a.home-page-search-route-button'));
    await button.waitExist();
    await button.scrollIntoView();
    await button.click();
    const trailsPage = new TrailsPage(TrailsPageType.PUBLIC_SEARCH);
    await trailsPage.waitDisplayed();
    return trailsPage;
  }
}
