import { ChangeDetectorRef, Component, EnvironmentInjector, Injector, Input, OnDestroy, OnInit } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { ModalController, IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonFooter, IonButtons, IonButton, IonRadioGroup, IonRadio, IonCheckbox } from '@ionic/angular/standalone';
import { PdfGenerator, PdfModel, PdfOptions } from './generation/pdf-generator';
import { environment } from 'src/environments/environment';
import { IdGenerator } from 'src/app/utils/component-utils';
import { FileService } from 'src/app/services/file/file.service';
import { BinaryContent } from 'src/app/utils/binary-content';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { FormsModule } from '@angular/forms';
import { NgStyle } from '@angular/common';
import { AuthService } from 'src/app/services/auth/auth.service';
import { TrailLinkService } from 'src/app/services/database/link.service';
import { ComputedWayPoint, Track } from 'src/app/model/track';
import { TrackService } from 'src/app/services/database/track.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { first } from 'rxjs';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { hasWaypointsContent } from './waypoints-utils';
import { MapLayersService } from 'src/app/services/map/map-layers.service';
import { TypeUtils } from 'src/app/utils/type-utils';
import { Console } from 'src/app/utils/console';

export function openPdfPopup(injector: Injector, trail: Trail) {
  injector.get(ModalController).create({
    component: PdfPopup,
    componentProps: {
      trail
    },
    cssClass: 'large-modal',
  }).then(m => m.present());
}

const KEY_LOCAL_STORAGE = 'trailence.pdf-options';

@Component({
  templateUrl: './pdf-popup.component.html',
  styleUrl: './pdf-popup.component.scss',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonFooter, IonButtons, IonButton, IonCheckbox, IonRadioGroup, IonRadio,
    FormsModule, NgStyle,
]
})
export class PdfPopup implements OnInit, OnDestroy {

  @Input() trail!: Trail;

  pdfUrl?: string;
  blob?: Blob;
  generationPercent?: number;
  id = IdGenerator.generateId();

  qrCodeActivated = false;
  options = this.loadPdfOptions();

  link?: string;

  availableModels = Object.keys(PdfModel);
  viewer: any = undefined;
  pdfTask: any = undefined;

  wayPoints: ComputedWayPoint[] = [];
  track?: Track;
  hasDescription = true;
  hasWayPoints = false;

  constructor(
    private readonly changeDetector: ChangeDetectorRef,
    private readonly injector: Injector,
    private readonly environmentInjector: EnvironmentInjector,
    public readonly i18n: I18nService,
    private readonly auth: AuthService,
    private readonly mapLayerService: MapLayersService,
    private readonly modalController: ModalController,
  ) {}

  private loadPdfOptions(): PdfOptions {
    const s = localStorage.getItem(KEY_LOCAL_STORAGE);
    if (s) {
      try {
        const json = JSON.parse(s);
        this.qrCodeActivated = !!json.qrCode;
        return {
          model: TypeUtils.valueToEnum(json.model, PdfModel) ?? PdfModel.BIG_MAP,
          includeDescription: !!json.includeDescription,
          includeWaypoints: !!json.includeWaypoints,
          includeElevation: !!json.includeElevation,
          mapLayer: (json.mapLayer ? this.mapLayerService.layers.find(l => l.name === json.mapLayer) : undefined) ?? this.mapLayerService.layers.find(l => l.name === this.mapLayerService.getDefaultLayer())!,
        }
      } catch (e) {
        Console.error('Cannot parse saved pdf options', e);
        // ignore
      }
    }
    return {
      model: PdfModel.BIG_MAP,
      includeDescription: true,
      includeWaypoints: true,
      includeElevation: true,
      mapLayer: this.mapLayerService.layers.find(l => l.name === this.mapLayerService.getDefaultLayer())!,
    }
  }

  ngOnInit(): void {
    if (this.trail.owner === 'trailence' && this.trail.source) {
      this.link = this.trail.source;
    } else if (this.trail.owner === this.auth.email) {
      const trailLink = this.injector.get(TrailLinkService).getLinkForTrail(this.trail.uuid);
      if (trailLink) this.link = environment.baseUrl + '/trail/link/' + trailLink.link;
    }
    if (this.link && this.qrCodeActivated) this.options.qrCode = this.link;
    this.hasDescription = !!this.trail.description?.trim().length;
    if (!this.hasDescription) this.options.includeDescription = false;
    this.injector.get(TrackService).getFullTrack$(this.trail.currentTrackUuid, this.trail.owner).pipe(filterDefined(), first()).subscribe(t => {
      this.track = t;
      this.wayPoints = ComputedWayPoint.compute(t, this.injector.get(PreferencesService).preferences);
      this.hasWayPoints = hasWaypointsContent(this.wayPoints);
      if (!this.hasWayPoints) this.options.includeWaypoints = false;
    });
    this.optionsChanged();
  }

  optionsValid(): boolean {
    return true;
  }

  optionsChanged(): void {
    if (this.optionsValid()) {
      localStorage.setItem(KEY_LOCAL_STORAGE, JSON.stringify({
        ...this.options,
        mapLayer: this.options.mapLayer.name,
        qrCode: this.options.qrCode ? true : false,
      }))
      this.generate();
    }
  }

  qrCodeChanged(checked: boolean): void {
    if (checked) {
      this.options.qrCode = this.link;
    } else {
      this.options.qrCode = undefined;
    }
    this.optionsChanged();
  }

  async selectLayer() {
    const module = await import('../map-layer-selection/map-layer-selection.component');
    const modal = await this.modalController.create({
      component: module.MapLayerSelectionComponent,
      componentProps: {
        popup: true,
        initialSelection: [this.options.mapLayer.name],
        onSelectionChanged: (sel: string[]) => {
          if (sel.length === 1) {
            const newLayer = this.mapLayerService.layers.find(l => l.name === sel[0]);
            if (newLayer && newLayer !== this.options.mapLayer) {
              this.options.mapLayer = newLayer;
              this.optionsChanged();
            }
          }
        }
      }
    });
    await modal.present();
  }

  private generationCounter = 0;
  async generate() {
    const counter = ++this.generationCounter;

    if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl);
    this.pdfUrl = undefined;
    this.blob = undefined;
    this.generationPercent = 0;
    if (this.pdfTask) this.pdfTask.destroy();
    this.pdfTask = undefined;
    this.changeDetector.detectChanges();
    const generatorModule = await import('./generation/pdf-generator');
    const progress = (pc: number) => {
      if (counter !== this.generationCounter) return;
      this.generationPercent = pc;
      this.changeDetector.detectChanges();
    };
    const blob = await generatorModule.PdfGenerator.generate(this.injector, this.environmentInjector, this.trail, this.track, this.wayPoints, this.options, progress);
    if (counter !== this.generationCounter) return;
    this.blob = blob;
    this.pdfUrl = URL.createObjectURL(this.blob);

    PdfGenerator.loadCss('/pdf-viewer/pdf_viewer.css');
    await PdfGenerator.loadJs('pdf.min.mjs', 'module');
    progress(85);
    (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = environment.assetsUrl + '/pdf.worker.min.mjs';
    await PdfGenerator.loadJs('pdf-viewer/pdf_viewer.mjs', 'module');
    progress(90);
    if (counter !== this.generationCounter) return;
    this.pdfTask = (window as any).pdfjsLib.getDocument(this.pdfUrl);
    progress(95);
    const pdf = await this.pdfTask.promise;
    if (counter !== this.generationCounter) return;
    await this.displayPreview(pdf, counter);
    this.generationPercent = undefined;
    this.changeDetector.detectChanges();
  }

  private async displayPreview(pdf: any, counter: number) {
    if (counter !== this.generationCounter) return;
    if (this.viewer !== undefined) {
      this.viewer.setDocument(pdf);
      if (this.viewer.pagesCount === 0)
        await this.viewer.firstPagePromise;
      this.viewer.currentScaleValue = this.zooms[this.zoomIndex] / 100;
      return;
    }
    const container = document.getElementById('pdf-container-' + this.id);
    if (!container) {
      setTimeout(() => this.displayPreview(pdf, counter), 0);
      return;
    }
    const viewer = new (window as any).pdfjsViewer.PDFViewer({
      container,
      eventBus: new (window as any).pdfjsViewer.EventBus(),
    });
    viewer.setDocument(pdf);
    if (viewer.pagesCount === 0)
      await viewer.firstPagePromise;
    viewer.currentScaleValue = this.zooms[this.zoomIndex] / 100;
    this.viewer = viewer;
  }

  ngOnDestroy(): void {
    if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl);
    if (this.pdfTask) this.pdfTask.destroy();
  }

  download(): void {
    this.injector.get(FileService).saveBinaryData('trailence.pdf', new BinaryContent(this.blob!));
  }

  close(): void {
    this.modalController.dismiss();
  }

  zooms = [25, 50, 75, 100, 150, 200, 300, 400, 500];
  zoomIndex = 3;
  zoomIn(): void {
    this.zoomIndex++;
    if (this.viewer) this.viewer.currentScaleValue = this.zooms[this.zoomIndex] / 100;
  }

  zoomOut(): void {
    this.zoomIndex--;
    if (this.viewer) this.viewer.currentScaleValue = this.zooms[this.zoomIndex] / 100;
  }

}
