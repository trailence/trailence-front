import { ChangeDetectorRef, Component, Injectable, Injector, Input } from '@angular/core';
import Trailence from '../trailence.service';
import { Console } from 'src/app/utils/console';
import { AuthService } from 'src/app/services/auth/auth.service';
import { filter, first } from 'rxjs';
import { TrailMenuService } from 'src/app/services/database/trail-menu.service';
import { IonHeader, IonContent, IonToolbar, IonTitle, IonLabel, IonFooter, IonButtons, IonButton, ModalController, IonRadio, IonRadioGroup } from "@ionic/angular/standalone";
import { Router } from '@angular/router';
import { ErrorService } from 'src/app/services/progress/error.service';
import { TrailCollection, TrailCollectionType } from 'src/app/model/trail-collection';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { CommonModule } from '@angular/common';
import { ProgressService } from 'src/app/services/progress/progress.service';
import { TranslatedString } from 'src/app/services/i18n/i18n-string';

@Injectable({providedIn: 'root'})
export class PlatformService {

  constructor(
    private readonly injector: Injector,
  ) {
    this.listenToImportGpx();
  }

  private listenToImportGpx(): void {
    const files = new Map<number, {nbChunks: number, chunks: string[], filename?: string}>();
    Trailence.listenToImportedFiles((message) => {
      if (message.chunks !== undefined) {
        files.set(message.fileId, {nbChunks: message.chunks, chunks: new Array(message.chunks), filename: message.filename});
        Console.info('Start receiving new file from device with ' + message.chunks + ' chunks and name: ' + message.filename);
      } else if (message.chunkIndex !== undefined && message.data !== undefined) {
        const file = files.get(message.fileId);
        if (!file) {
          Console.error('Received a chunk of data from device for an unknown file id', message.fileId);
          return;
        }
        file.chunks[message.chunkIndex] = message.data;
        let done = true;
        for (const chunk of file.chunks) {
          if (chunk === undefined || chunk === null) {
            done = false;
            break;
          }
        }
        Console.info('new chunk of data received from device', file);
        if (done) {
          files.delete(message.fileId);
          this.importGpx(file.chunks, file.filename);
        }
      }
    });
  }

  private importGpx(chunks: string[], filename?: string): void {
    Console.info('Received GPX data to import from device');
    this.injector.get(AuthService).auth$.pipe(
      filter(auth => !!auth),
      first(),
    ).subscribe(auth => {
      const owner = auth.email;
      const binaryChunks = chunks.map(c => atob(c));
      let size = 0;
      for (const c of binaryChunks) size += c.length;
      const bytes = new Uint8Array(size);
      let pos = 0;
      for (const c of binaryChunks) {
        for (let i = 0; i < c.length; ++i)
          bytes[pos + i] = c.charCodeAt(i);
        pos += c.length;
      }
      const buffer = bytes.buffer;

      const menuService = this.injector.get(TrailMenuService);
      this.injector.get(ModalController).create({
        component: ImportGpxPopupComponent,
        backdropDismiss: false,
        componentProps: {
          filename,
          onDone: (collectionUuid: string) => {
            const i18n = this.injector.get(I18nService);
            const progress = this.injector.get(ProgressService).create(i18n.texts.tools.importing, 1);
            menuService.importGpx(buffer, owner, collectionUuid)
            .then(imported => {
              progress.done();
              menuService.finishImport([imported], collectionUuid).then(
                () => this.injector.get(Router).navigateByUrl('/trail/' + encodeURIComponent(owner) + '/' + imported.trailUuid)
              );
            })
            .catch(error => {
              this.injector.get(ErrorService).addError(error);
            });
          }
        }
      }).then(modal => modal.present());
    });
  }

}

@Component({
  selector: 'app-import-gpx-popup',
  template: `
<ion-header>
  <ion-toolbar color="primary">
    <ion-title>
      <ion-label>{{i18n.texts.pages.import_gpx_popup.title}}</ion-label>
    </ion-title>
  </ion-toolbar>
</ion-header>
<ion-content class="ion-padding">

  <div style="margin-bottom: 15px;">
    {{getMessage()}}
  </div>

  <ion-radio-group (ionChange)="collectionUuid = $event.detail.value" [value]="collectionUuid">
    <div *ngFor="let collection of collections"><ion-radio labelPlacement="end" value="{{collection.uuid}}">{{ collectionName(collection) }}</ion-radio></div>
  </ion-radio-group>

  <div style="display: flex; flex-direction: row; align-items: center; justify-content: center;">
    <ion-button fill="clear" (click)="newCollection()">{{i18n.texts.pages.trails.actions.new_collection}}</ion-button>
  </div>

</ion-content>
<ion-footer>
  <ion-toolbar color="footer">
    <ion-buttons slot="end">
      <ion-button color="success" [disabled]="!collectionUuid" (click)="ok()">{{i18n.texts.buttons.confirm}}</ion-button>
      <ion-button (click)="cancel()">{{i18n.texts.buttons.cancel}}</ion-button>
    </ion-buttons>
  </ion-toolbar>
</ion-footer>
`,
  styleUrls: [],
  imports: [IonRadioGroup, IonRadio, IonButton, IonButtons, IonFooter, IonLabel, IonTitle, IonToolbar, IonContent, IonHeader, CommonModule]
})
class ImportGpxPopupComponent {

  @Input() filename?: string;
  @Input() onDone!: (collectionUuid: string) => void;

  collectionUuid?: string;

  collections: TrailCollection[] = [];

  constructor(
    public i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly collectionService: TrailCollectionService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    this.collectionService.getAll$().pipe(collection$items()).subscribe(collections => {
      this.collections = collections;
      this.changeDetector.detectChanges();
    });
  }

  getMessage(): string {
    return new TranslatedString('pages.import_gpx_popup.message', [this.filename ? ' "' + this.filename + '" ' : ' ']).translate(this.i18n);
  }

  collectionName(collection: TrailCollection): string {
    if (collection.type != TrailCollectionType.MY_TRAILS || collection.name.length > 0) return collection.name;
    return this.i18n.texts.my_trails;
  }

  newCollection(): void {
    this.collectionService.collectionPopup(undefined, false)
    .then(result => {
      if (result.role !== 'apply' || !result.data) return;
      const col = result.data as TrailCollection;
      this.collectionUuid = col.uuid;
      this.changeDetector.detectChanges();
    });
  }

  ok(): void {
    this.onDone(this.collectionUuid!);
    this.modalController.dismiss(null, 'ok');
  }

  cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }

}
