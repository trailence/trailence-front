import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ReleaseNotesComponent } from '../release-notes/release-notes.component';
import { IonHeader, IonButton, IonToolbar, IonTitle, IonIcon, IonLabel, IonFooter, IonButtons, ModalController } from "@ionic/angular";
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { UpdateService } from '@trailence/services/update/update.service';
import { trailenceAppVersionName } from '@trailence/trailence-version';

@Component({
  templateUrl: './release-notes-popup.component.html',
  styleUrl: './release-notes-popup.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    IonButtons, IonFooter, IonLabel, IonIcon, IonTitle, IonToolbar, IonButton, IonHeader,
    ReleaseNotesComponent,
  ]
})
export class ReleaseNotesPopup {

  sinceVersion!: number;
  type: 'updated' | 'available' = 'updated';
  currentVersion = trailenceAppVersionName;

  constructor(
    public readonly i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly updateService: UpdateService,
  ) {}

  close(): void {
    this.modalController.dismiss();
  }

  install(): void {
    this.updateService.downloadAndUpdate();
    this.close();
  }

}
