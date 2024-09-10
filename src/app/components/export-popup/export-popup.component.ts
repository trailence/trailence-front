import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { IonHeader, IonIcon, IonToolbar, IonTitle, IonLabel, IonFooter, IonButton, IonButtons, ModalController, IonContent, IonRadioGroup, IonRadio } from "@ionic/angular/standalone";
import { Trail } from 'src/app/model/trail';
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Component({
  selector: 'app-export-popup',
  templateUrl: './export-popup.component.html',
  styleUrls: ['./export-popup.component.scss'],
  standalone: true,
  imports: [IonRadio, IonRadioGroup, IonContent, IonButtons, IonButton, IonFooter, IonLabel, IonTitle, IonToolbar, IonIcon, IonHeader, CommonModule ]
})
export class ExportPopupComponent implements OnInit {

  @Input() trails!: Trail[];

  what?: 'original' | 'current' | 'both';
  hasBoth = true;

  constructor(
    public i18n: I18nService,
    private modalController: ModalController,
  ) { }

  ngOnInit(): void {
    this.hasBoth = !!this.trails.find(t => t.originalTrackUuid !== t.currentTrackUuid);
    if (!this.hasBoth) this.what = 'original';
  }

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
