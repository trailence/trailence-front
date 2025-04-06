import { HeaderComponent } from '../../components/header.component';
import { TrailComponent } from '../../components/trail.component';
import { Page, PageWithHeader } from './page';

export class TrailPage extends PageWithHeader {

  constructor(
    public readonly owner: string,
    public readonly uuid: string,
    public readonly owner2?: string,
    public readonly uuid2?: string,
  ) {
    super('trail-page');
  }

  protected override expectedUrl(url: string): boolean {
    if (!this.owner2 || !this.uuid2)
      return url.indexOf('/trail/' + this.owner + '/' + this.uuid) > 0;
    if (url.indexOf('/trail/' + this.owner + '/' + this.uuid + '/' + this.owner2 + '/' + this.uuid2) > 0) {
      return true;
    }
    if (url.indexOf('/trail/' + this.owner2 + '/' + this.uuid2 + '/' + this.owner + '/' + this.uuid) > 0) {
      return true;
    }
    return false;
  }

  public get trailComponent() { return new TrailComponent(this.getElement().$('app-trail')); }

  public static async waitForName(trailName: string) {
    await browser.waitUntil(() => Page.getActivePageElement().then(p => new HeaderComponent(p).getTitle()).then(title => title === trailName));
    const url = await browser.getUrl();
    const i = url.indexOf('/trail/');
    const j = url.indexOf('/', i + 7);
    const owner = url.substring(i + 7, j);
    let uuid = url.substring(j + 1).substring(0, 36);
    return new TrailPage(owner, uuid);
  }

}
