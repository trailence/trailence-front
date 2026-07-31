import { Component } from '../../components/component';
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
    await browser.waitUntil(() => this.getElement(true).$('a.home-page-search-route-button').isExisting());
    const button = this.getElement().$('a.home-page-search-route-button');
    await Component.scrollIntoView(button);
    await button.click();
    const trailsPage = new TrailsPage(TrailsPageType.PUBLIC_SEARCH);
    await trailsPage.waitDisplayed();
    return trailsPage;
  }
}
