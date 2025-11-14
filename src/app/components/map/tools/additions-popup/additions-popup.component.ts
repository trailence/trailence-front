import { Component, Input } from '@angular/core';
import { MapAdditionsOptions } from 'src/app/services/map/map-additions.service';
import { IonCheckbox, IonIcon, IonLabel, IonButton, ModalController } from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MapLayer, MapLayersService } from 'src/app/services/map/map-layers.service';

@Component({
  template: `
  <div class="header">
    <div>{{i18n.texts.mapAdditions.title}}</div>
    <ion-button size="small" fill="clear" color="dark" (click)="close()">
      <ion-icon name="cross"></ion-icon>
    </ion-button>
  </div>
  <div class="content">
    <div>
      <ion-checkbox [(ngModel)]="options.guidepost" labelPlacement="end" (ngModelChange)="emitChange()">
        <ion-icon name="poi-guidepost"></ion-icon>
        <ion-label>{{i18n.texts.mapAdditions.guidepost}}</ion-label>
      </ion-checkbox>
    </div>
    <div>
      <ion-checkbox [(ngModel)]="options.waterPoint" labelPlacement="end" (ngModelChange)="emitChange()">
        <ion-icon name="poi-water"></ion-icon>
        <ion-label>{{i18n.texts.mapAdditions.water}}</ion-label>
      </ion-checkbox>
    </div>
    <div>
      <ion-checkbox [(ngModel)]="options.toilets" labelPlacement="end" (ngModelChange)="emitChange()">
        <ion-icon name="poi-toilets"></ion-icon>
        <ion-label>{{i18n.texts.mapAdditions.toilets}}</ion-label>
      </ion-checkbox>
    </div>
    <div>
      <ion-checkbox [(ngModel)]="options.forbiddenWays" labelPlacement="end" (ngModelChange)="emitChange()">
        <svg width="24px" height="4px" viewBox="0 0 24 4"><path stroke="var(--way-forbidden-color)" stroke-width="6" stroke-dasharray="4" fill="none" d="M0 0 H24"/></svg>
        <ion-label>{{i18n.texts.mapAdditions.way_forbidden}}</ion-label>
      </ion-checkbox>
    </div>
    <div>
      <ion-checkbox [(ngModel)]="options.permissiveWays" labelPlacement="end" (ngModelChange)="emitChange()">
        <svg width="24px" height="4px" viewBox="0 0 24 4"><path stroke="var(--way-permissive-color)" stroke-width="6" stroke-dasharray="4" fill="none" d="M0 0 H24"/></svg>
        <ion-label>{{i18n.texts.mapAdditions.way_permissive}}</ion-label>
      </ion-checkbox>
    </div>
    @for (overlay of overlays; track overlay.name) {
      <div>
        <ion-checkbox [checked]="selectedOverlays.includes(overlay.name)" labelPlacement="end" (ionChange)="selectOverlay(overlay.name, $event.detail.checked)">
          <ion-label>{{i18n.texts.mapAdditions.overlays[overlay.name] ?? overlay.displayName}}</ion-label>
        </ion-checkbox>
      </div>
    }
  </div>
  `,
  styles: `
  div.header {
    background-color: var(--ion-color-primary);
    color: var(--ion-color-primary-contrast);
    padding: 2px 8px;
    display: flex;
    flex-direction: row;
    align-items: center;

    div {
      flex: 1 1 100%;
    }

    ion-button {
      flex: none;
      margin: 0;
      --padding-start: 5px;
      --padding-end: 5px;
      --padding-top: 0;
      --padding-bottom: 0;
    }
  }
  div.content {
    padding: 8px;

    ion-checkbox {
      ion-icon {
        width: 20px;
        height: 20px;
        margin-right: 4px;
      }
      ion-label {
        margin-left: 4px;
      }
    }
  }
  `,
  imports: [
    IonCheckbox, IonIcon, IonLabel, IonButton,
    FormsModule,
  ],
})
export class AdditionsPopupComponent {

  @Input() options!: MapAdditionsOptions;
  @Input() selectedOverlays!: string[];
  @Input() onOptionsChange!: (options: MapAdditionsOptions) => void;
  @Input() onOverlaysChange!: (selection: string[]) => void;

  overlays: MapLayer[];

  constructor(
    public readonly i18n: I18nService,
    private readonly modalController: ModalController,
    readonly layerService: MapLayersService,
  ) {
    this.overlays = layerService.overlays;
  }

  emitChange(): void {
    this.onOptionsChange(this.options);
  }

  selectOverlay(name: string, selected: boolean | null | undefined): void {
    if (selected) {
      if (this.selectedOverlays.includes(name)) return;
      this.selectedOverlays.push(name);
    } else {
      const index = this.selectedOverlays.indexOf(name);
      if (index < 0) return;
      this.selectedOverlays.splice(index, 1);
    }
    this.onOverlaysChange(this.selectedOverlays);
  }

  close(): void {
    this.modalController.dismiss();
  }

}
