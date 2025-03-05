import { Component, ViewChild } from '@angular/core';
import { TableComponent } from '../../components/table/table.component';
import { TableColumn, TableSettings } from '../../components/table/table-settings';
import { PageRequest } from '../../components/paginator/page-request';
import { PageResult } from '../../components/paginator/page-result';
import { HttpService } from 'src/app/services/http/http.service';
import { environment } from 'src/environments/environment';
import { PlanDto } from '../../model/plan';
import { IonButton, ModalController } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Component({
  templateUrl: './plans.page.html',
  styleUrl: './plans.page.scss',
  imports: [
    TableComponent,
    IonButton
  ],
})
export class AdminPlansPage {

  @ViewChild(TableComponent) table?: TableComponent;

  constructor(
    private readonly http: HttpService,
    public readonly i18n: I18nService,
    private readonly modalController: ModalController,
  ) {}

  tableSettings = new TableSettings(
    [
      new TableColumn('admin.plans.plan').withSortableField('name'),
      new TableColumn('pages.myaccount.quotas.collections').withSortableField('collections'),
      new TableColumn('pages.myaccount.quotas.trails').withSortableField('trails'),
      new TableColumn('admin.users.quota_tracks').withSortableField('tracks'),
      new TableColumn('pages.myaccount.quotas.tracks-size').withSortableField('tracksSize'),
      new TableColumn('pages.myaccount.quotas.tags').withSortableField('tags'),
      new TableColumn('pages.myaccount.quotas.trail-tags').withSortableField('trailTags'),
      new TableColumn('pages.myaccount.quotas.photos').withSortableField('photos'),
      new TableColumn('pages.myaccount.quotas.photos-size').withSortableField('photosSize'),
      new TableColumn('pages.myaccount.quotas.shares').withSortableField('shares'),
      new TableColumn('admin.plans.subscriptions').withSortableField('subscriptionsCount'),
      new TableColumn('admin.plans.activeSubscriptions').withSortableField('activeSubscriptionsCount'),
    ],
    (request: PageRequest) => this.http.get<PageResult<PlanDto>>(environment.apiBaseUrl + '/admin/plans/v1' + request.toQueryParams()),
    'admin.plans.error'
  );

  async newPlan() {
    const module = await import('./plan-form/plan-form.component');
    const modal = await this.modalController.create({
      component: module.PlanFormComponent
    });
    await modal.present();
    modal.onDidDismiss().then(event => {
      if (event.role === 'save') this.table?.refreshData();
    });
  }

  async openPlan(plan: PlanDto) {
    const module = await import('./plan-form/plan-form.component');
    const modal = await this.modalController.create({
      component: module.PlanFormComponent,
      componentProps: {
        plan
      }
    });
    await modal.present();
    modal.onDidDismiss().then(event => {
      if (event.role === 'save') this.table?.refreshData();
    });
  }
}
