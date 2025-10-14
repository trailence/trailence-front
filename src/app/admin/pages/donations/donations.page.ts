import { Component } from '@angular/core';
import { TableColumn, TableSettings } from '../../components/table/table-settings';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { HttpService } from 'src/app/services/http/http.service';
import { DonationDto } from '../../model/donation';
import { environment } from 'src/environments/environment';
import { PageRequest } from '../../components/paginator/page-request';
import { PageResult } from '../../components/paginator/page-result';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { IonSegment, IonSegmentButton, IonButton, ModalController } from '@ionic/angular/standalone';
import { TableComponent } from '../../components/table/table.component';
import { DonationGoalsComponent } from './goals/donation-goals.component';
import { DonationPage } from 'src/app/pages/donation/donation.page';
import { NgClass } from '@angular/common';

@Component({
  templateUrl: './donations.page.html',
  styleUrl: './donations.page.scss',
  imports: [
    IonSegment, IonSegmentButton, IonButton,
    TableComponent, DonationGoalsComponent, DonationPage,
    NgClass,
  ]
})
export class AdminDonationsPage {

  constructor(
    private readonly http: HttpService,
    public readonly i18n: I18nService,
    private readonly prefs: PreferencesService,
    private readonly modalController: ModalController,
  ) {}

  view = 'donations_list';

  amountFormatter = (v: number) => '€ ' + (v / 1000000).toLocaleString(this.prefs.preferences.lang, {maximumFractionDigits: 2, minimumFractionDigits: 2});

  donationsTableSettings = new TableSettings(
    [
      new TableColumn('admin.donations.platform').withSortableField('platform'),
      new TableColumn('admin.donations.date').withSortableField('timestamp', v => this.i18n.timestampToDateTimeString(v)),
      new TableColumn('admin.donations.amount').withSortableField('amount', v => this.amountFormatter(v)),
      new TableColumn('admin.donations.realAmount').withSortableField('realAmount', v => this.amountFormatter(v)),
      new TableColumn('admin.donations.email').withSortableField('email'),
    ],
    (request: PageRequest) => this.http.get<PageResult<DonationDto>>(environment.apiBaseUrl + '/donation/v1' + request.toQueryParams()),
    'admin.donations.error'
  );

  setView(value: any): void {
    this.view = value as string;
  }

  async openDonation(donation: DonationDto) {
    const module = await import('./donation-form/donation-form.component');
    const modal = await this.modalController.create({
      component: module.DonationFormComponent,
      componentProps: {
        donation
      }
    });
    await modal.present();
  }

  async newDonation() {
    const module = await import('./donation-form/donation-form.component');
    const modal = await this.modalController.create({
      component: module.DonationFormComponent,
      componentProps: {
      }
    });
    await modal.present();
  }
}
