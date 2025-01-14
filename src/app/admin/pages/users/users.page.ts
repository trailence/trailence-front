import { Component } from '@angular/core';
import { HttpService } from 'src/app/services/http/http.service';
import { environment } from 'src/environments/environment';
import { TableComponent } from '../../components/table/table.component';
import { PageRequest } from '../../components/paginator/page-request';
import { PageResult } from '../../components/paginator/page-result';
import { HorizontalAlignment, TableColumn, TableSettings } from '../../components/table/table-settings';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { UserDto } from '../../model/user';
import { ModalController } from '@ionic/angular/standalone';
import { StringUtils } from 'src/app/utils/string-utils';

@Component({
  selector: 'app-admin-users-page',
  templateUrl: './users.page.html',
  styleUrl: './users.page.scss',
  imports: [
    TableComponent,
  ]
})
export class AdminUsersPage {

  constructor(
    private readonly http: HttpService,
    private readonly i18n: I18nService,
    private readonly modalController: ModalController,
  ) {}

  tableSettings = new TableSettings(
    [
      new TableColumn('admin.users.email').withSortableField('email'),
      new TableColumn('admin.users.createdAt').withSortableField('createdAt', v => this.i18n.timestampToDateTimeString(v)),
      new TableColumn('admin.users.password').withSortableField('complete', v => this.i18n.texts.buttons[v ? 'yes' : 'no']).hAlign(HorizontalAlignment.CENTER),
      new TableColumn('admin.users.administrator').withSortableField('admin', v => this.i18n.texts.buttons[v ? 'yes' : 'no']).hAlign(HorizontalAlignment.CENTER),
      new TableColumn('admin.users.invalidLoginAttempts').withSortableField('invalidLoginAttempts').hAlign(HorizontalAlignment.CENTER),
      new TableColumn('admin.users.lastLogin').withSortableField('lastLogin', v => this.i18n.timestampToDateTimeString(v)),
      new TableColumn('admin.users.minVersion').withSortableField('minAppVersion', StringUtils.versionCodeToVersionName),
      new TableColumn('admin.users.maxVersion').withSortableField('maxAppVersion', StringUtils.versionCodeToVersionName),
    ],
    (request: PageRequest) => this.http.get<PageResult<UserDto>>(environment.apiBaseUrl + '/admin/users/v1' + request.toQueryParams()),
    'admin.users.error'
  );

  displayUser(user: any): void {
    import('../../components/user/user.component')
    .then(m => this.modalController.create({
      component: m.UserComponent,
      componentProps: {
        user,
      }
    })).then(m => m.present());
  }

}
