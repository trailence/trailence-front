import { ChangeDetectorRef, Component, ElementRef, Injector, Input, OnInit, ViewChild } from '@angular/core';
import { Photo } from 'src/app/model/photo';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonButton, IonFooter, IonButtons, IonCheckbox, ModalController, IonTextarea, AlertController, IonSegment, IonSegmentButton, IonContent } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { ToolbarComponent } from '../menus/toolbar/toolbar.component';
import { MenuItem } from '../menus/menu-item';
import { PhotoService } from 'src/app/services/database/photo.service';
import { first } from 'rxjs';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';

export async function openEditor(injector: Injector, photo: Photo) {
  const modal = await injector.get(ModalController).create({
    component: PhotoEditorComponent,
    componentProps: {
      photo,
    },
    cssClass: 'large-modal',
  });
  await modal.present();
}

@Component({
  templateUrl: './photo-editor.component.html',
  styleUrl: './photo-editor.component.scss',
  imports: [
    IonCheckbox, IonButtons, IonFooter, IonButton, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, IonTextarea, IonSegment, IonSegmentButton, IonContent,
    ToolbarComponent,
  ]
})
export class PhotoEditorComponent implements OnInit {

  @Input() photo!: Photo;

  @ViewChild('photoEditorContainer') photoEditorContainer!: ElementRef;
  @ViewChild('photoEditorCanvas') photoEditorCanvas!: ElementRef;

  constructor(
    public readonly i18n: I18nService,
    private readonly photoService: PhotoService,
    private readonly preferences: PreferencesService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly modalController: ModalController,
  ) {}

  applying = false;

  toolbarItems: MenuItem[] = [
    new MenuItem().setIcon('rotate-clockwise').setI18nLabel('pages.photo_editor.rotate_clockwise')
      .setDisabled(() => this.applying)
      .setAction(() => this.rotate(true)),
    new MenuItem().setIcon('rotate-counterclockwise').setI18nLabel('pages.photo_editor.rotate_counterclockwise')
      .setDisabled(() => this.applying)
      .setAction(() => this.rotate(false)),
    new MenuItem(),
    new MenuItem().setIcon('undo').setI18nLabel('buttons.undo')
      .setDisabled(() => this.historyBack.length === 0 || this.applying)
      .setAction(() => this.undo()),
    new MenuItem().setIcon('redo').setI18nLabel('buttons.redo')
      .setDisabled(() => this.historyForward.length === 0 || this.applying)
      .setAction(() => this.redo()),
  ];

  ngOnInit(): void {
    this.photoService.getFile$(this.photo).pipe(first()).subscribe(blob => this.pushHistory(blob));
  }

  private photoImage?: HTMLImageElement;
  blob?: Blob;
  private blobUrl?: string;
  historyBack: Blob[] = [];
  private historyForward: Blob[] = [];

  private urlCreator = globalThis.URL || globalThis.webkitURL;

  private refresh(): void {
    this.toolbarItems = [...this.toolbarItems];
    this.changeDetector.detectChanges();
  }

  private pushHistory(blob: Blob) {
    this.historyForward = [];
    if (this.blob)
      this.historyBack.push(this.blob);
    this.updateFromBlob(blob);
  }

  private undo(): void {
    if (this.historyBack.length === 0) return;
    const newBlob = this.historyBack.splice(this.historyBack.length - 1, 1)[0];
    this.historyForward.push(this.blob!);
    this.updateFromBlob(newBlob);
  }

  private redo(): void {
    if (this.historyForward.length === 0) return;
    const newBlob = this.historyForward.splice(this.historyForward.length - 1, 1)[0];
    this.historyBack.push(this.blob!);
    this.updateFromBlob(newBlob);
  }

  private updateFromBlob(blob: Blob): void {
    this.applying = true;
    if (this.blobUrl) this.urlCreator.revokeObjectURL(this.blobUrl);
    this.blob = blob;
    this.blobUrl = this.urlCreator.createObjectURL(this.blob);
    const img = document.createElement('IMG') as HTMLImageElement;
    img.onload = () => {
      if (this.blob !== blob) return;
      this.photoImage = img;
      const imgWidth = img.naturalWidth;
      const imgHeight = img.naturalHeight;
      const containerWidth = this.photoEditorContainer.nativeElement.offsetWidth;
      const containerHeight = this.photoEditorContainer.nativeElement.offsetHeight;
      const containerRatio = Math.min(
        containerWidth >= imgWidth ? 1 : containerWidth / imgWidth,
        containerHeight >= imgHeight ? 1 : containerHeight / imgHeight
      );
      const renderCanvas = this.photoEditorCanvas.nativeElement as HTMLCanvasElement;
      renderCanvas.width = imgWidth * containerRatio;
      renderCanvas.height = imgHeight * containerRatio;
      const renderContext = renderCanvas.getContext("2d") as CanvasRenderingContext2D;
      renderContext.drawImage(img, 0, 0, imgWidth, imgHeight, 0, 0, imgWidth * containerRatio, imgHeight * containerRatio);
      this.applying = false;
      this.refresh();
    };
    img.src = this.blobUrl;
    this.refresh();
  }

  private rotate(clockwise: boolean): void {
    const original = this.photoImage!;
    const canvas = document.createElement('CANVAS') as HTMLCanvasElement;
    canvas.width = original.height;
    canvas.height = original.width;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((clockwise ? 90 : -90)*Math.PI/180);
    ctx.drawImage(original, -original.naturalWidth / 2, -original.naturalHeight / 2);
    this.applyTransform(canvas);
  }

  private applyTransform(canvas: HTMLCanvasElement) {
    this.applying = true;
    this.refresh();
    canvas.toBlob(newBlob => { if (newBlob) this.pushHistory(newBlob); }, 'image/jpeg', this.preferences.preferences.photoMaxQuality / 100);
  }

  close(save: boolean): void {
    if (save && this.blob && this.historyBack.length > 0) this.photoService.updateFile(this.photo, this.blob);
    this.modalController.dismiss();
  }

}
