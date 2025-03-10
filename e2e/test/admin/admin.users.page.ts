import { EmbeddedPage } from '../app/pages/page';
import { IonicSegment } from '../components/ionic/ion-segment';
import { AdminPage } from './admin.page';
import { TableComponent } from './table.component';

export class AdminUsersPage extends EmbeddedPage {

  constructor(adminPage: AdminPage) {
    super(adminPage, 'admin-users-page');
  }

  protected override expectedUrl(url: string): boolean {
    return url.indexOf('/admin/users') > 0;
  }

  public readonly table = new TableComponent(this, 'app-table');

  public readonly views = new IonicSegment(this, 'div.table-header ion-segment');

}
