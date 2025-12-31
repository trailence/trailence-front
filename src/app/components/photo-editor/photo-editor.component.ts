import { ChangeDetectorRef, Component, ElementRef, Injector, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Photo } from 'src/app/model/photo';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonButton, IonFooter, IonButtons, ModalController, IonRange } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { ToolbarComponent } from '../menus/toolbar/toolbar.component';
import { MenuItem } from '../menus/menu-item';
import { PhotoService } from 'src/app/services/database/photo.service';
import { first, Subscription } from 'rxjs';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { RangeComponent } from '../range/range.component';
import { BrowserService } from 'src/app/services/browser/browser.service';

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
    IonButtons, IonFooter, IonButton, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, IonRange,
    ToolbarComponent,
    RangeComponent,
  ]
})
export class PhotoEditorComponent implements OnInit, OnDestroy {

  @Input() photo!: Photo;

  @ViewChild('middle') middle!: ElementRef;
  @ViewChild('photoEditorCanvas') photoEditorCanvas!: ElementRef;

  constructor(
    public readonly i18n: I18nService,
    private readonly photoService: PhotoService,
    private readonly preferences: PreferencesService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly modalController: ModalController,
    readonly browser: BrowserService,
  ) {
    this.smallWidth = browser.width < 500;
    this.subscription = browser.resize$.subscribe(size => this.smallWidth = size.width < 500);
  }

  subscription?: Subscription;
  smallWidth = false;

  applying = false;
  tool?: Tool;

  toolbarItems: MenuItem[] = [
    new MenuItem().setIcon('rotate-clockwise').setI18nLabel('pages.photo_editor.rotate_clockwise')
      .setDisabled(() => this.applying)
      .setAction(() => this.rotate(true)),
    new MenuItem().setIcon('rotate-counterclockwise').setI18nLabel('pages.photo_editor.rotate_counterclockwise')
      .setDisabled(() => this.applying)
      .setAction(() => this.rotate(false)),
    new MenuItem().setIcon('crop').setI18nLabel('pages.photo_editor.crop')
      .setDisabled(() => this.applying)
      .setAction(() => this.startCrop()),
    new MenuItem().setIcon('blur').setI18nLabel('pages.photo_editor.blur')
      .setDisabled(() => this.applying)
      .setAction(() => this.startBlur()),
    new MenuItem(),
    new MenuItem().setIcon('undo').setI18nLabel('buttons.undo')
      .setDisabled(() => this.historyBack.length === 0 || this.applying)
      .setAction(() => this.undo()),
    new MenuItem().setIcon('redo').setI18nLabel('buttons.redo')
      .setDisabled(() => this.historyForward.length === 0 || this.applying)
      .setAction(() => this.redo()),
  ];
  toolbarItemsShown: MenuItem[] = this.toolbarItems;

  ngOnInit(): void {
    this.photoService.getFile$(this.photo).pipe(first()).subscribe(blob => this.pushHistory(blob));
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  photoImage?: HTMLImageElement;
  blob?: Blob;
  private blobUrl?: string;
  historyBack: Blob[] = [];
  private historyForward: Blob[] = [];

  private urlCreator = globalThis.URL || globalThis.webkitURL;

  private refresh(): void {
    this.toolbarItemsShown = this.tool?.toolbarItems ? [...this.tool.toolbarItems] : [...this.toolbarItems];
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
      const draw = () => {
        if (this.middle.nativeElement.offsetWidth === 0) {
          setTimeout(() => draw(), 10);
        } else {
          this.drawImage();
          this.applying = false;
          this.refresh();
        }
      };
      draw();
    };
    img.src = this.blobUrl;
    this.refresh();
  }

  public drawImage(): {canvas: HTMLCanvasElement, ratio: number, ctx: CanvasRenderingContext2D} {
    const img = this.photoImage!;
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;
    const containerWidth = this.middle.nativeElement.offsetWidth - 100;
    const containerHeight = this.middle.nativeElement.offsetHeight;
    const containerRatio = Math.min(
      containerWidth >= imgWidth ? 1 : containerWidth / imgWidth,
      containerHeight >= imgHeight ? 1 : containerHeight / imgHeight
    );
    const renderCanvas = this.photoEditorCanvas.nativeElement as HTMLCanvasElement;
    renderCanvas.width = imgWidth * containerRatio;
    renderCanvas.height = imgHeight * containerRatio;
    const renderContext = renderCanvas.getContext("2d") as CanvasRenderingContext2D;
    renderContext.drawImage(img, 0, 0, imgWidth, imgHeight, 0, 0, imgWidth * containerRatio, imgHeight * containerRatio);
    return {canvas: renderCanvas, ratio: containerRatio, ctx: renderContext};
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

  applyTransform(canvas: HTMLCanvasElement) {
    this.applying = true;
    this.refresh();
    canvas.toBlob(newBlob => { if (newBlob) this.pushHistory(newBlob); }, 'image/jpeg', this.preferences.preferences.photoMaxQuality / 100);
  }

  getBottomToolRange(): {value: {lower: number, upper: number}, min: number, max: number, size: number} | undefined {
    if (this.tool && (this.tool as any)['x1'] !== undefined) {
      const area = this.tool as ToolAreaRange;
      return {
        value: {
          lower: area.x1,
          upper: area.x2,
        },
        min: area.minX,
        max: area.maxX,
        size: (this.photoEditorCanvas.nativeElement as HTMLCanvasElement).width,
      }
    }
    return undefined;
  }

  setBottomToolValue(value: any): void {
    const range = value as {lower: number, upper: number};
    const area = this.tool as ToolAreaRange;
    area.x1 = range.lower;
    area.x2 = range.upper;
    this.tool!.refresh();
    this.refresh();
  }


  getLeftToolRange(): {value: {lower: number, upper: number}, min: number, max: number, size: number} | undefined {
    if (this.tool && (this.tool as any)['x1'] !== undefined) {
      const area = this.tool as ToolAreaRange;
      return {
        value: {
          lower: area.y1,
          upper: area.y2,
        },
        min: area.minY,
        max: area.maxY,
        size: (this.photoEditorCanvas.nativeElement as HTMLCanvasElement).height,
      }
    }
    return undefined;
  }

  setLeftToolValue(value: any): void {
    const range = value as {lower: number, upper: number};
    const area = this.tool as ToolAreaRange;
    area.y1 = range.lower;
    area.y2 = range.upper;
    this.tool!.refresh();
    this.refresh();
  }

  private startCrop(): void {
    this.tool = new CropTool(this, 0, 0, this.photoImage!.naturalWidth - 1, this.photoImage!.naturalHeight - 1, 0, this.photoImage!.naturalWidth - 1, 0, this.photoImage!.naturalHeight - 1);
    this.tool!.refresh();
    this.refresh();
  }

  private startBlur(): void {
    this.tool = new BlurTool(this, 0, 0, this.photoImage!.naturalWidth - 1, this.photoImage!.naturalHeight - 1, 0, this.photoImage!.naturalWidth - 1, 0, this.photoImage!.naturalHeight - 1);
    this.tool!.refresh();
    this.refresh();
  }

  getBlurValue(): number {
    if (this.tool?.name === 'blur') return (this.tool as BlurTool).blur;
    return 1;
  }

  setBlurValue(value: any): void {
    if (!value || this.tool?.name !== 'blur') return;
    (this.tool as BlurTool).blur = value as number;
    this.tool!.refresh();
  }

  cancelTool(): void {
    this.tool = undefined;
    this.drawImage();
    this.refresh();
  }

  close(save: boolean): void {
    if (save && this.blob && this.historyBack.length > 0) this.photoService.updateFile(this.photo, this.blob);
    this.modalController.dismiss();
  }

}

interface Tool {
  name: string;
  toolbarItems?: MenuItem[];

  refresh(): void;
}

interface ToolAreaRange extends Tool {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

class CropTool implements Tool, ToolAreaRange {

  name = 'crop';
  toolbarItems: MenuItem[] = [
    new MenuItem().setSectionTitle(true).setIcon('crop').setI18nLabel('pages.photo_editor.crop').setTextColor('medium'),
    new MenuItem(),
    new MenuItem().setIcon('checkmark').setI18nLabel('buttons.apply')
      .setTextColor('success')
      .setAction(() => this.apply()),
    new MenuItem().setIcon('cross').setI18nLabel('buttons.cancel')
      .setAction(() => this.component.cancelTool()),
  ];

  constructor(
    private readonly component: PhotoEditorComponent,
    public x1: number,
    public y1: number,
    public x2: number,
    public y2: number,
    public minX: number,
    public maxX: number,
    public minY: number,
    public maxY: number,
  ) {
  }

  refresh(): void {
    const render = this.component.drawImage();
    render.ctx.save();
    render.ctx.fillStyle = 'rgba(0,0,0,0.4)';
    if (this.y1 > 0) {
      render.ctx.fillRect(0, 0, render.canvas.width, this.y1 * render.ratio);
    }
    if (this.y2 < this.maxY) {
      render.ctx.fillRect(0, (this.y2 * render.ratio) + 1, render.canvas.width, (this.maxY - this.y2) * render.ratio);
    }
    if (this.x1 > 0) {
      render.ctx.fillRect(0, this.y1 * render.ratio, this.x1 * render.ratio, (this.y2 - this.y1) * render.ratio + 1);
    }
    if (this.x2 < this.maxX) {
      render.ctx.fillRect((this.x2 * render.ratio) + 1, this.y1 * render.ratio, render.canvas.width - (this.x2 * render.ratio), (this.y2 - this.y1) * render.ratio + 1);
    }
    render.ctx.restore();
  }

  apply(): void {
    const original = this.component.photoImage!;
    const canvas = document.createElement('CANVAS') as HTMLCanvasElement;
    canvas.width = this.x2 - this.x1;
    canvas.height = this.y2 - this.y1;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.drawImage(original, this.x1, this.y1, this.x2 - this.x1, this.y2 - this.y1, 0, 0, this.x2 - this.x1, this.y2 - this.y1);
    this.component.applyTransform(canvas);
    this.component.cancelTool();
  }

}

class BlurTool implements Tool, ToolAreaRange {
  name = 'blur';
  toolbarItems: MenuItem[] = [
    new MenuItem().setSectionTitle(true).setIcon('blur').setI18nLabel('pages.photo_editor.blur').setTextColor('medium'),
    new MenuItem(),
    new MenuItem().setCustomContentSelector('.blur-control'),
    new MenuItem(),
    new MenuItem().setIcon('checkmark').setI18nLabel('buttons.apply')
      .setTextColor('success')
      .setAction(() => this.apply()),
    new MenuItem().setIcon('cross').setI18nLabel('buttons.cancel')
      .setAction(() => this.component.cancelTool()),
  ];

  constructor(
    private readonly component: PhotoEditorComponent,
    public x1: number,
    public y1: number,
    public x2: number,
    public y2: number,
    public minX: number,
    public maxX: number,
    public minY: number,
    public maxY: number,
    public blur: number = 3,
  ) {
  }

  refresh(): void {
    const render = this.component.drawImage();
    render.ctx.save();
    render.ctx.filter = 'blur(' + this.blur + 'px)';
    render.ctx.drawImage(this.component.photoImage!,
      this.x1, this.y1, this.x2 - this.x1 + 1, this.y2 - this.y1 + 1,
      this.x1 * render.ratio - this.blur, this.y1 * render.ratio - this.blur, (this.x2 - this.x1 + 1) * render.ratio + this.blur * 2, (this.y2 - this.y1 + 1) * render.ratio + this.blur * 2);
    render.ctx.restore();
  }

  apply(): void {
    const original = this.component.photoImage!;
    const canvas = document.createElement('CANVAS') as HTMLCanvasElement;
    canvas.width = original.naturalWidth;
    canvas.height = original.naturalHeight;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.drawImage(original, 0, 0, original.naturalWidth, original.naturalHeight);
    ctx.filter = 'blur(' + this.blur + 'px)';
    ctx.drawImage(original,
      this.x1, this.y1, this.x2 - this.x1 + 1, this.y2 - this.y1 + 1,
      this.x1 - this.blur, this.y1 - this.blur, (this.x2 - this.x1 + 1) + this.blur * 2, (this.y2 - this.y1 + 1) + this.blur * 2);
    this.component.applyTransform(canvas);
    this.component.cancelTool();
  }
}
