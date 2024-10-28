import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { IonHeader, IonContent, IonToolbar, IonTitle, IonIcon, IonLabel, IonFooter, IonButtons, IonButton, ModalController, IonRadio, IonRadioGroup } from "@ionic/angular/standalone";
import { first } from 'rxjs';
import { TrailCollection, TrailCollectionType } from 'src/app/model/trail-collection';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { collection$items } from 'src/app/utils/rxjs/collection$items';

@Component({
  selector: 'app-import-gpx-popup',
  templateUrl: './import-gpx-popup.component.html',
  styleUrls: ['./import-gpx-popup.component.scss'],
  standalone: true,
  imports: [IonRadioGroup, IonRadio, IonButton, IonButtons, IonFooter, IonLabel, IonIcon, IonTitle, IonToolbar, IonContent, IonHeader, CommonModule ]
})
export class ImportGpxPopupComponent {

  @Input() onDone!: (collectionUuid: string) => void;

  collectionUuid?: string;

  collections: TrailCollection[] = [];

  constructor(
    public i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly collectionService: TrailCollectionService,
  ) {
    this.collectionService.getAll$().pipe(collection$items(), first()).subscribe(collections => this.collections = collections);
  }

  collectionName(collection: TrailCollection): string {
    if (collection.type != TrailCollectionType.MY_TRAILS || collection.name.length > 0) return collection.name;
    return this.i18n.texts.my_trails;
  }

  ok(): void {
    this.onDone(this.collectionUuid!);
    this.modalController.dismiss(null, 'ok');
  }

  cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }

}
