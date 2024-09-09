import { Component } from '@angular/core';
import { IonHeader, IonIcon, IonToolbar, IonTitle, IonLabel, IonFooter, IonButton, IonButtons, ModalController, IonContent, IonRadioGroup, IonRadio } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Component({
  selector: 'app-export-popup',
  templateUrl: './export-popup.component.html',
  styleUrls: ['./export-popup.component.scss'],
  standalone: true,
  imports: [IonRadio, IonRadioGroup, IonContent, IonButtons, IonButton, IonFooter, IonLabel, IonTitle, IonToolbar, IonIcon, IonHeader, ]
})
export class ExportPopupComponent {

  what?: 'original' | 'current' | 'both';

  constructor(
    public i18n: I18nService,
    private modalController: ModalController,
  ) { }

  cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }

  valid(): boolean {
    return !!this.what;
  }

  ok(): void {
    this.modalController.dismiss({
      what: this.what,
    }, 'ok');
  }

}
