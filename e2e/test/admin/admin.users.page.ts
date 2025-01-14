import { EmbeddedPage } from '../app/pages/page';
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

}
