import { CommonModule } from '@angular/common';
import { Component, Injector, Input } from '@angular/core';
import { IonHeader, IonButton, IonToolbar, IonIcon, IonLabel, IonContent, IonFooter, IonButtons, ModalController } from "@ionic/angular/standalone";
import { Trail } from 'src/app/model/trail';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Component({
  templateUrl: './start-publication-modal.component.html',
  styleUrl: './start-publication-modal.component.scss',
  imports: [IonButtons, IonFooter, IonContent, IonLabel, IonIcon, IonToolbar, IonButton, IonHeader, CommonModule]
})
export class StartPublicationModal {

  @Input() trail!: Trail;

  constructor(
    public readonly i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly injector: Injector,
  ) {}

  creating = false;

  create(): void {
    this.creating = true;
    this.injector.get(TrailCollectionService)
    .getOrCreatePublicationDraft()
    .subscribe(col => {
      import('../../../services/functions/copy-trails')
      .then(m => m.copyTrailsTo(this.injector, [this.trail], col, col.owner, true, true, true, (newTrails) => {
        this.injector.get(TrailService).doUpdate(newTrails[0], t => t.publishedFromUuid = this.trail.uuid);
        this.modalController.dismiss();
      }))
    });
  }

  cancel(): void {
    this.modalController.dismiss();
  }

}
