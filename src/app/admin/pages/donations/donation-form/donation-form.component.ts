import { Component, Input, OnInit } from '@angular/core';
import { DonationDto } from 'src/app/admin/model/donation';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonFooter, IonButtons, IonButton, IonInput, ModalController } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpService } from 'src/app/services/http/http.service';
import { environment } from 'src/environments/environment';
import { ErrorService } from 'src/app/services/progress/error.service';

@Component({
  templateUrl: './donation-form.component.html',
  styleUrl: './donation-form.component.scss',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonFooter, IonButtons, IonButton, IonInput,
    FormsModule, CommonModule,
  ]
})
export class DonationFormComponent implements OnInit {

  @Input() donation?: DonationDto;

  constructor(
    public readonly i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly http: HttpService,
    private readonly errorService: ErrorService,
  ) {}

  dto!: DonationDto;

  ngOnInit(): void {
    if (this.donation) this.dto = {
      ...this.donation,
      amount: this.donation.amount / 1000000,
      realAmount: this.donation.realAmount / 1000000,
    }; else this.dto = {
      uuid: window.crypto.randomUUID(),
      platform: '',
      platformId: '',
      timestamp: 0,
      amount: 0,
      realAmount: 0,
      email: '',
      details: null,
    }
  }

  save(): void {
    if (this.dto.platform.trim().length === 0) return;
    if (this.dto.platformId.trim().length === 0) return;
    let request;
    if (this.donation) {
      const body = {
        uuid: this.donation.uuid,
        platform: this.dto.platform.trim(),
        platformId: this.dto.platformId.trim(),
        timestamp: this.donation.timestamp,
        amount: Math.floor(this.dto.amount * 1000000),
        realAmount: Math.floor(this.dto.realAmount * 1000000),
        email: this.dto.email.trim(),
        details: this.donation.details
      } as DonationDto;
      request = this.http.put(environment.apiBaseUrl + '/donation/v1/' + body.uuid, body);
    } else {
      const body = {
        uuid: this.dto.uuid,
        platform: this.dto.platform.trim(),
        platformId: this.dto.platformId.trim(),
        timestamp: Date.now(),
        amount: this.dto.amount.toFixed(6),
        amountCurrency: 'EUR',
        realAmount: this.dto.realAmount.toFixed(6),
        realAmountCurrency: 'EUR',
        email: this.dto.email.trim(),
        details: null
      };
      request = this.http.post(environment.apiBaseUrl + '/donation/v1', body);
    }
    request.subscribe({
      next: () => this.close(),
      error: e => {
        this.errorService.addNetworkError(e, 'admin.donations.error', []);
      }
    });
  }

  delete(): void {
    this.http.delete(environment.apiBaseUrl + '/donation/v1/' + this.donation!.uuid).subscribe({
      next: () => this.close(),
      error: e => {
        this.errorService.addNetworkError(e, 'admin.donations.error', []);
      }
    });
  }

  close(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}