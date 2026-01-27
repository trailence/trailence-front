import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Injector, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { Photo } from 'src/app/model/photo';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonButton, IonFooter, IonButtons, ModalController, IonRange } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { ToolbarComponent } from '../menus/toolbar/toolbar.component';
import { MenuItem } from '../menus/menu-item';
import { PhotoService } from 'src/app/services/database/photo.service';
import { first, Observable, of, Subscription } from 'rxjs';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { RangeComponent } from '../range/range.component';
import { BrowserService } from 'src/app/services/browser/browser.service';
import { NgStyle } from '@angular/common';

export async function openEditor(injector: Injector, photo: Photo) {
  const modal = await injector.get(ModalController).create({
    component: PhotoEditorComponent,
    componentProps: {
      initialBlob: () => injector.get(PhotoService).getFile$(photo),
    },
    cssClass: 'large-modal',
  });
  modal.onDidDismiss().then(result => {
    if (result.data)
      injector.get(PhotoService).updateFile(photo, result.data);
  });
  await modal.present();
}

@Component({
  selector: 'app-photo-editor',
  templateUrl: './photo-editor.component.html',
  styleUrl: './photo-editor.component.scss',
  imports: [
    IonButtons, IonFooter, IonButton, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, IonRange,
    ToolbarComponent,
    RangeComponent,
    NgStyle,
  ]
})
export class PhotoEditorComponent implements OnInit, OnDestroy, OnChanges {

  @Input() initialBlob!: (() => Observable<Blob>) | Blob;
  @Input() embedded = false;
  @Input() rounded = false;
  @Output() blobChange = new EventEmitter<{blob: Blob, changed: boolean}>();

  @ViewChild('photoEditorArea') photoEditorArea!: ElementRef;
  @ViewChild('photoEditorCanvas') photoEditorCanvas!: ElementRef;

  constructor(
    public readonly i18n: I18nService,
    private readonly preferences: PreferencesService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly modalController: ModalController,
    readonly browser: BrowserService,
  ) {
    this.smallWidth = browser.width < 450;
    this.subscription = browser.resize$.subscribe(size => {
      this.smallWidth = size.width < 450;
      if (this.photoImage) {
        this.drawImage();
        this.tool?.refresh();
        this.changeDetector.detectChanges();
      }
    });
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

  private isInit = false;

  ngOnInit(): void {
    this.isInit = true;
    if (typeof this.initialBlob === 'function')
      this.initialBlob().pipe(first()).subscribe(blob => this.pushHistory(blob));
    else
      this.pushHistory(this.initialBlob);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.isInit && changes['initialBlob']) {
      const newBlob = typeof this.initialBlob === 'function' ? this.initialBlob() : of(this.initialBlob);
      newBlob.pipe(first()).subscribe(blob => {
        this.blob = undefined;
        if (this.blobUrl) this.urlCreator.revokeObjectURL(this.blobUrl);
        this.blobUrl = undefined;
        this.historyBack = [];
        this.historyForward = [];
        this.pushHistory(blob);
      });
    }
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
    this.blobChange.emit({blob, changed: this.historyBack.length > 0});
  }

  private undo(): void {
    if (this.historyBack.length === 0) return;
    const newBlob = this.historyBack.splice(this.historyBack.length - 1, 1)[0];
    this.historyForward.push(this.blob!);
    this.updateFromBlob(newBlob);
    this.blobChange.emit({blob: newBlob, changed: this.historyBack.length > 0});
  }

  private redo(): void {
    if (this.historyForward.length === 0) return;
    const newBlob = this.historyForward.splice(this.historyForward.length - 1, 1)[0];
    this.historyBack.push(this.blob!);
    this.updateFromBlob(newBlob);
    this.blobChange.emit({blob: newBlob, changed: this.historyBack.length > 0});
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
        if (this.photoEditorArea.nativeElement.offsetWidth === 0) {
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

  canvasArea = {x: 50, y: 10, width: 1, height: 1};

  public drawImage(ignoreRounded: boolean = false): {canvas: HTMLCanvasElement, ratio: number, ctx: CanvasRenderingContext2D} {
    const img = this.photoImage!;
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;
    const containerWidth = this.photoEditorArea.nativeElement.offsetWidth - 60;
    const containerHeight = this.photoEditorArea.nativeElement.offsetHeight - 60;
    const containerRatio = Math.min(
      containerWidth >= imgWidth ? 1 : containerWidth / imgWidth,
      containerHeight >= imgHeight ? 1 : containerHeight / imgHeight
    );
    const renderCanvas = this.photoEditorCanvas.nativeElement as HTMLCanvasElement;
    this.canvasArea = {
      x: (containerWidth / 2) - (imgWidth * containerRatio / 2) + 50,
      y: 10,
      width: imgWidth * containerRatio,
      height: imgHeight * containerRatio
    };
    renderCanvas.width = this.canvasArea.width;
    renderCanvas.height = this.canvasArea.height;
    renderCanvas.style.left = this.canvasArea.x + 'px';
    renderCanvas.style.top = this.canvasArea.y + 'px';
    const renderContext = renderCanvas.getContext("2d") as CanvasRenderingContext2D;
    renderContext.drawImage(img, 0, 0, imgWidth, imgHeight, 0, 0, imgWidth * containerRatio, imgHeight * containerRatio);
    if (this.rounded && !ignoreRounded) {
      const size = Math.min(renderCanvas.width, renderCanvas.height);
      const dx = renderCanvas.width - size;
      const dy = renderCanvas.height - size;
      CropTool.renderRounded(renderContext, dx / 2, renderCanvas.width - dx / 2, dy / 2, renderCanvas.height - dy / 2, renderCanvas.width, renderCanvas.height);
    }
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
    this.applyTransform(canvas)
    .then(() => {
      this.applying = false;
      this.refresh();
    });
  }

  applyTransform(canvas: HTMLCanvasElement): Promise<any> {
    this.applying = true;
    this.refresh();
    return new Promise(resolve => {
      canvas.toBlob(newBlob => {
        if (newBlob) this.pushHistory(newBlob);
        resolve(null);
      }, 'image/jpeg', this.preferences.preferences.photoMaxQuality / 100);
    })
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
    if (save && this.blob && this.historyBack.length > 0)
      this.modalController.dismiss(this.blob);
    else
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
    const render = this.component.drawImage(true);
    if (this.component.rounded) {
      const w = this.x2 - this.x1 + 1;
      const h = this.y2 - this.y1 + 1;
      const size = Math.min(w, h);
      const dx = (w - size) / 2;
      const dy = (h - size) / 2;
      CropTool.renderRounded(render.ctx, (this.x1 + dx) * render.ratio, (this.x2 - dx) * render.ratio, (this.y1 + dy) * render.ratio, (this.y2 - dy) * render.ratio, (this.maxX - this.minX + 1) * render.ratio, (this.maxY - this.minY + 1) * render.ratio);
    }
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
    this.component.applyTransform(canvas).then(() => this.component.cancelTool());
  }

  public static renderRounded(ctx: CanvasRenderingContext2D, x1: number, x2: number, y1: number, y2: number, w: number, h: number): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(x1 + (x2 - x1) / 2, y1 + (y2 - y1) / 2, (x2 - x1) / 2, 0, Math.PI * 2, true);
    ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
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
    this.component.applyTransform(canvas).then(() => this.component.cancelTool());
  }
}
