import { Component, Injector, Input } from '@angular/core';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { IonHeader, IonToolbar, IonTitle, IonLabel, IonContent, IonFooter, IonButtons, IonButton, IonInput, ModalController } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { I18nPipe } from 'src/app/services/i18n/i18n-string';
import { CommonModule } from '@angular/common';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Console } from 'src/app/utils/console';

@Component({
  templateUrl: './import-from-url.component.html',
  styleUrl: './import-from-url.component.scss',
  imports: [IonHeader, IonToolbar, IonTitle, IonLabel, IonContent, IonFooter, IonButtons, IonButton, IonInput, I18nPipe, CommonModule]
})
export class ImportFromUrlComponent {

  @Input() collectionUuid!: string;

  url = '';
  clipboard?: Document;
  detectedSource?: string;
  message?: string;

  inProgress = false;

  constructor(
    private readonly injector: Injector,
    public readonly i18n: I18nService,
    private readonly fetchSourceService: FetchSourceService,
    private readonly modalController: ModalController,
    private readonly trailCollectionService: TrailCollectionService,
    private readonly authService: AuthService,
  ) {
  }

  updateUrl(value: string): void {
    this.clipboard = undefined;
    this.url = value.trim();
    if (this.url.length === 0) {
      this.message = undefined;
      this.detectedSource = undefined;
    } else {
      this.fetchSourceService.waitReady$().subscribe(() => {
        this.detectedSource = this.fetchSourceService.canFetchTrailByUrl(value)?.name;
        if (!this.detectedSource) this.detectedSource = this.fetchSourceService.canFetchTrailsByUrl(value)?.name;
        if (!this.detectedSource) this.message = this.i18n.texts.pages.import_from_url.unknown_source;
        else this.message = undefined;
      });
    }
  }

  importClipboard(): void {
    this.url = '';
    this.message = undefined;
    this.clipboard = undefined;
    navigator.clipboard.read().then(c => {
      let found = false;
      for (const item of c) {
        Console.info('Item found in clipboard', item.types);
        if (item.types.includes('text/html')) {
          item.getType('text/html').then(html => {
            html.text().then(txt => {
              const parser = new DOMParser();
              const doc = parser.parseFromString(txt, 'text/html');
              this.fetchSourceService.waitReady$().subscribe(() => {
                const source = this.fetchSourceService.canFetchTrailsByContent(doc);
                if (source) {
                  this.clipboard = doc;
                  this.detectedSource = source.name;
                } else {
                  this.message = this.i18n.texts.pages.import_from_url.nothing_found_in_clipboard;
                }
              });
            });
          }).catch(e => {
            Console.error('Error reading html from clipboard', e);
            this.message = this.i18n.texts.pages.import_from_url.nothing_found_in_clipboard;
          });
          found = true;
          break;
        }
      }
      if (!found) this.message = this.i18n.texts.pages.import_from_url.nothing_found_in_clipboard;
    });
  }

  async doImport() {
    this.inProgress = true;
    const trails = this.clipboard ? await this.fetchSourceService.fetchTrailsByContent(this.clipboard) : await this.fetchSourceService.fetchTrailsByUrl(this.url);
    if (trails.length === 0) {
      this.message = this.i18n.texts.pages.import_from_url.fetch_error;
      this.inProgress = false;
      return;
    }
    const email = this.authService.email!;
    const collection = this.trailCollectionService.getCollection(this.collectionUuid, email)!;
    const copy = await import('../../services/functions/copy-trails');
    copy.copyTrailsTo(this.injector, trails, collection, email, false, true);
    this.close();
  }

  close(): void {
    this.modalController.dismiss(null, 'cancel');
  }

}
