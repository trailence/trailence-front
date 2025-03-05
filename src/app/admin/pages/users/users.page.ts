import { Component } from '@angular/core';
import { HttpService } from 'src/app/services/http/http.service';
import { environment } from 'src/environments/environment';
import { TableComponent } from '../../components/table/table.component';
import { PageRequest } from '../../components/paginator/page-request';
import { PageResult } from '../../components/paginator/page-result';
import { HorizontalAlignment, TableColumn, TableSettings } from '../../components/table/table-settings';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { UserDto } from '../../model/user';
import { ModalController, IonSegment, IonSegmentButton } from '@ionic/angular/standalone';
import { StringUtils } from 'src/app/utils/string-utils';

@Component({
  selector: 'app-admin-users-page',
  templateUrl: './users.page.html',
  styleUrl: './users.page.scss',
  imports: [
    TableComponent,
    IonSegment, IonSegmentButton,
  ]
})
export class AdminUsersPage {

  constructor(
    private readonly http: HttpService,
    public readonly i18n: I18nService,
    private readonly modalController: ModalController,
  ) {}

  tableSettingsGeneral = new TableSettings(
    [
      new TableColumn('admin.users.email').withSortableField('email'),
      new TableColumn('admin.users.createdAt').withSortableField('createdAt', v => this.i18n.timestampToDateTimeString(v)),
      new TableColumn('admin.users.password').withSortableField('complete', v => this.i18n.texts.buttons[v ? 'yes' : 'no']).hAlign(HorizontalAlignment.CENTER),
      new TableColumn('admin.users.administrator').withSortableField('admin', v => this.i18n.texts.buttons[v ? 'yes' : 'no']).hAlign(HorizontalAlignment.CENTER),
      new TableColumn('admin.users.invalidLoginAttempts').withSortableField('invalidLoginAttempts').hAlign(HorizontalAlignment.CENTER),
      new TableColumn('admin.users.lastLogin').withSortableField('lastLogin', v => this.i18n.timestampToDateTimeString(v)),
      new TableColumn('admin.users.minVersion').withSortableField('minAppVersion', StringUtils.versionCodeToVersionName),
      new TableColumn('admin.users.maxVersion').withSortableField('maxAppVersion', StringUtils.versionCodeToVersionName),
      new TableColumn('admin.users.roles').withField('roles'),
    ],
    (request: PageRequest) => this.http.get<PageResult<UserDto>>(environment.apiBaseUrl + '/admin/users/v1' + request.toQueryParams()),
    'admin.users.error'
  );

  private readonly simpleQuotaFormatter = (used: number, max: number) => used + ' / ' + max;
  private readonly sizeQuotaFormatter = (used: number, max: number) => this.i18n.sizeToString(used) + ' / ' + this.i18n.sizeToString(max);
  private readonly quotaStyle = (used: number, max: number) => ({'color': (used / max) < 0.75 ? 'var(--ion-color-success)' : (used >= max ? 'var(--ion-color-danger)' : 'var(--ion-color-warning)')});

  tableSettingsQuotas = new TableSettings(
    [
      new TableColumn('admin.users.email').withSortableField('email'),
      new TableColumn('pages.myaccount.quotas.collections')
        .withSortableField('quotas.collectionsUsed', (used, user: UserDto) => this.simpleQuotaFormatter(user.quotas.collectionsUsed, user.quotas.collectionsMax))
        .styleFromRowData((user: UserDto) => this.quotaStyle(user.quotas.collectionsUsed, user.quotas.collectionsMax)),
      new TableColumn('pages.myaccount.quotas.trails')
        .withSortableField('quotas.trailsUsed', (used, user: UserDto) => this.simpleQuotaFormatter(user.quotas.trailsUsed, user.quotas.trailsMax))
        .styleFromRowData((user: UserDto) => this.quotaStyle(user.quotas.trailsUsed, user.quotas.trailsMax)),
      new TableColumn('admin.users.quota_tracks')
        .withSortableField('quotas.tracksUsed', (used, user: UserDto) => this.simpleQuotaFormatter(user.quotas.tracksUsed, user.quotas.tracksMax))
        .styleFromRowData((user: UserDto) => this.quotaStyle(user.quotas.tracksUsed, user.quotas.tracksMax)),
      new TableColumn('pages.myaccount.quotas.tracks-size')
        .withSortableField('quotas.tracksSizeUsed', (used, user: UserDto) => this.sizeQuotaFormatter(user.quotas.tracksSizeUsed, user.quotas.tracksSizeMax))
        .styleFromRowData((user: UserDto) => this.quotaStyle(user.quotas.tracksSizeUsed, user.quotas.tracksSizeMax)),
      new TableColumn('pages.myaccount.quotas.tags')
        .withSortableField('quotas.tagsUsed', (used, user: UserDto) => this.simpleQuotaFormatter(user.quotas.tagsUsed, user.quotas.tagsMax))
        .styleFromRowData((user: UserDto) => this.quotaStyle(user.quotas.tagsUsed, user.quotas.tagsMax)),
      new TableColumn('pages.myaccount.quotas.trail-tags')
        .withSortableField('quotas.trailTagsUsed', (used, user: UserDto) => this.simpleQuotaFormatter(user.quotas.trailTagsUsed, user.quotas.trailTagsMax))
        .styleFromRowData((user: UserDto) => this.quotaStyle(user.quotas.trailTagsUsed, user.quotas.trailTagsMax)),
      new TableColumn('pages.myaccount.quotas.photos')
        .withSortableField('quotas.photosUsed', (used, user: UserDto) => this.simpleQuotaFormatter(user.quotas.photosUsed, user.quotas.photosMax))
        .styleFromRowData((user: UserDto) => this.quotaStyle(user.quotas.photosUsed, user.quotas.photosMax)),
      new TableColumn('pages.myaccount.quotas.photos-size')
        .withSortableField('quotas.photosSizeUsed', (used, user: UserDto) => this.sizeQuotaFormatter(user.quotas.photosSizeUsed, user.quotas.photosSizeMax))
        .styleFromRowData((user: UserDto) => this.quotaStyle(user.quotas.photosSizeUsed, user.quotas.photosSizeMax)),
      new TableColumn('pages.myaccount.quotas.shares')
        .withSortableField('quotas.sharesUsed', (used, user: UserDto) => this.simpleQuotaFormatter(user.quotas.sharesUsed, user.quotas.sharesMax))
        .styleFromRowData((user: UserDto) => this.quotaStyle(user.quotas.sharesUsed, user.quotas.sharesMax)),
    ],
    (request: PageRequest) => this.http.get<PageResult<UserDto>>(environment.apiBaseUrl + '/admin/users/v1' + request.toQueryParams()),
    'admin.users.error'
  );

  view = 'general';
  tableSettings = this.tableSettingsGeneral;

  displayUser(user: any): void {
    import('./user/user.component')
    .then(m => this.modalController.create({
      component: m.UserComponent,
      componentProps: {
        user,
      }
    })).then(m => m.present());
  }

  setView(value: any): void {
    if (value === 'general') {
      this.view = 'general';
      this.tableSettings = this.tableSettingsGeneral;
    } else if (value === 'quotas') {
      this.view = 'quotas';
      this.tableSettings = this.tableSettingsQuotas;
    }
  }
}
