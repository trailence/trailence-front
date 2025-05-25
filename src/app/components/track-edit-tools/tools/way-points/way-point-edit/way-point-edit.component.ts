import { Component, Input, OnInit } from '@angular/core';
import { WayPoint } from 'src/app/model/way-point';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonLabel, IonFooter, IonButtons, IonButton, IonIcon, ModalController, IonInput, IonTextarea } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Component({
  templateUrl: './way-point-edit.component.html',
  styleUrl: './way-point-edit.component.scss',
  imports: [IonTextarea, IonInput, IonIcon, IonButton, IonButtons, IonFooter, IonLabel, IonTitle, IonToolbar, IonHeader, IonContent, ]
})
export class WayPointEditModal implements OnInit {

  @Input() wayPoint!: WayPoint;
  @Input() isNew = false;

  name = '';
  description = '';

  constructor(
    public readonly i18n: I18nService,
    private readonly modalController: ModalController,
  ) {}

  ngOnInit(): void {
    this.name = this.wayPoint.name;
    this.description = this.wayPoint.description;
  }

  close(cancel: boolean): void {
    if (!cancel) {
      if (this.name === this.wayPoint.name && this.description === this.wayPoint.description) {
        if (!this.isNew)
          cancel = true;
      } else {
        this.wayPoint.name = this.name;
        this.wayPoint.description = this.description;
      }
    }
    this.modalController.dismiss(null, cancel ? 'cancel' : 'ok');
  }

  nameChanged(value: string): void {
    this.name = value.trim();
  }

  descriptionChanged(value: string): void {
    this.description = value.trim();
  }

}
