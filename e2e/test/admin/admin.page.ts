import { PageWithHeader } from '../app/pages/page';
import { IonicSegment } from '../components/ionic/ion-segment';
import { AdminUsersPage } from './admin.users.page';

export class AdminPage extends PageWithHeader {

  constructor() {
    super('admin-page');
  }

  protected override expectedUrl(url: string): boolean {
    return url.indexOf('/admin/') > 0;
  }

  public get menuSegment() { return new IonicSegment(this, 'div.header>ion-segment'); }

  public async openUsers() {
    await this.menuSegment.setSelected('users');
    const page = new AdminUsersPage(this);
    await page.waitDisplayed();
    return page;
  }

}
