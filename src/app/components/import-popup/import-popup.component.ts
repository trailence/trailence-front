import { Component, Injector, Input } from '@angular/core';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { IonHeader, IonToolbar, IonTitle, IonLabel, IonContent, IonFooter, IonButtons, IonButton, IonInput, ModalController, Platform } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { I18nPipe } from 'src/app/services/i18n/i18n-string';
import { CommonModule } from '@angular/common';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Console } from 'src/app/utils/console';
import { firstValueFrom } from 'rxjs';

@Component({
  templateUrl: './import-popup.component.html',
  styleUrl: './import-popup.component.scss',
  imports: [IonHeader, IonToolbar, IonTitle, IonLabel, IonContent, IonFooter, IonButtons, IonButton, IonInput, I18nPipe, CommonModule]
})
export class ImportPopupComponent {

  @Input() collectionUuid!: string;

  url = '';
  urlMessage?: string;
  urlDetectedSource?: string;

  clipboardEnabled = false;
  clipboard?: Document;
  clipboardMessage?: string;

  inProgress = false;

  constructor(
    private readonly injector: Injector,
    public readonly i18n: I18nService,
    private readonly fetchSourceService: FetchSourceService,
    private readonly modalController: ModalController,
    private readonly trailCollectionService: TrailCollectionService,
    private readonly authService: AuthService,
    readonly platform: Platform,
  ) {
    this.clipboardEnabled = !platform.is('capacitor');
  }

  fromFile(): void {
    import('../../services/functions/import').then(m => m.openImportTrailsFileDialog(this.injector, this.collectionUuid));
    this.modalController.dismiss();
  }

  updateUrl(value: string): void {
    this.clipboard = undefined;
    this.url = value.trim();
    if (this.url.length === 0) {
      this.urlMessage = undefined;
      this.urlDetectedSource = undefined;
    } else {
      this.fetchSourceService.waitReady$().subscribe(() => {
        this.urlDetectedSource = this.fetchSourceService.canFetchTrailByUrl(value)?.name
          ?? this.fetchSourceService.canFetchTrailsByUrl(value)?.name;
        if (!this.urlDetectedSource) this.urlMessage = this.i18n.texts.pages.import_popup.unknown_source;
        else this.urlMessage = undefined;
      });
    }
  }

  async importClipboard() { // NOSONAR
    this.url = '';
    this.clipboardMessage = undefined;
    this.clipboard = undefined;
    const items = await navigator.clipboard.read();
    let found = false;
    let url: string | undefined = undefined;
    for (const item of items) {
      Console.info('Item found in clipboard', item.types);
      if (item.types.includes('text/html')) {
        try {
          const html = await item.getType('text/html').then(html => html.text());
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          await firstValueFrom(this.fetchSourceService.waitReady$());
          const source = this.fetchSourceService.canFetchTrailsByContent(doc);
          if (source) {
            this.clipboard = doc;
            found = true;
            await this.doImport();
            break;
          }
        } catch(e) {
          Console.error('Error reading html from clipboard', e);
          this.clipboardMessage = this.i18n.texts.pages.import_popup.nothing_found_in_clipboard;
        };
      } else if (item.types.includes('text/plain') && !url) {
        try {
          const text = await item.getType('text/plain').then(text => text.text());
          if (text.startsWith('http')) url = text.trim();
        } catch (e) { // NOSONAR
          // ignore
        }
      }
    }
    if (found) return;
    if (url) {
      this.updateUrl(url);
      return;
    }
    this.clipboardMessage = this.i18n.texts.pages.import_popup.nothing_found_in_clipboard;
  }

  async doImport() {
    this.inProgress = true;
    const trails = this.clipboard ? await this.fetchSourceService.fetchTrailsByContent(this.clipboard) : await this.fetchSourceService.fetchTrailsByUrl(this.url);
    if (trails.length === 0) {
      if (this.clipboard) this.clipboardMessage = this.i18n.texts.pages.import_popup.fetch_error;
      else this.urlMessage = this.i18n.texts.pages.import_popup.fetch_error;
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
