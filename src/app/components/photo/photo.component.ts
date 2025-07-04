import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { Photo } from 'src/app/model/photo';
import { IonSpinner, IonIcon } from "@ionic/angular/standalone";
import { CommonModule } from '@angular/common';
import { PhotoService } from 'src/app/services/database/photo.service';
import { Console } from 'src/app/utils/console';

@Component({
    selector: 'app-photo',
    templateUrl: './photo.component.html',
    styleUrl: './photo.component.scss',
    imports: [IonIcon, IonSpinner, CommonModule]
})
export class PhotoComponent implements OnChanges, OnDestroy {

  @Input() maxWidth?: number;
  @Input() maxHeight?: number;
  @Input() photo?: Photo;
  @Input() loadWhenVisible = false;
  @Input() zoomable = false;

  @Output() blobSize = new EventEmitter<number>();

  @ViewChild('image') img?: ElementRef;

  blob?: string;
  error = false;
  private subscription?: Subscription;

  constructor(
    private readonly photoService: PhotoService,
    private readonly changesDetector: ChangeDetectorRef,
    private readonly elementRef: ElementRef,
  ) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['photo']) {
      if (changes['photo'].previousValue !== undefined && changes['photo'].currentValue !== undefined &&
          changes['photo'].previousValue.owner === changes['photo'].currentValue.owner &&
          changes['photo'].previousValue.uuid === changes['photo'].currentValue.uuid)
          return;
      this.subscription?.unsubscribe();
      this.subscription = undefined;
      this.error = false;
      this.setBlob(undefined);
      if (this.photo) {
        const loadPhoto = (photo: Photo) => {
          this.subscription = this.photoService.getBlobUrl$(photo.owner, photo.uuid).subscribe({
            next: blob => {
              this.setBlob(blob);
            },
            error: e => {
              Console.error('Error loading photo', e);
              this.error = true;
              this.changesDetector.detectChanges();
            }
          });
        }
        if (!this.loadWhenVisible) loadPhoto(this.photo);
        else {
          const p = this.photo;
          const observer = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) {
              observer.disconnect();
              if (this.photo?.uuid === p.uuid && this.photo?.owner === p.owner)
                loadPhoto(p);
            }
          });
          observer.observe(this.elementRef.nativeElement);
        }
      }
    }
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private setBlob(blob: {url: string, blobSize?: number} | undefined | null) {
    if (!blob) this.blob = undefined;
    else {
      this.blob = blob.url;
      this.blobSize.emit(blob.blobSize);
    }
    this.changesDetector.detectChanges();
  }

  onWheel(event: WheelEvent): void {
    if (!this.zoomable || !(event instanceof WheelEvent) || !this.img) return;
    const image = this.img.nativeElement as HTMLImageElement;
    const x = (event.layerX - (-(((image.width * this.zoomScale) - image.width) / 2) + this.zoomTranslateX)) / this.zoomScale;
    const y = (event.layerY - (-(((image.height * this.zoomScale) - image.height) / 2) + this.zoomTranslateY)) / this.zoomScale;
    if (event.deltaX + event.deltaY < 0) this.zoomIn(image, x, y, 1.25);
    else if (event.deltaX + event.deltaY > 0) this.zoomOut(image, x, y, 1.25);
  }

  private _mouseMove = false;
  private readonly _pointers: {id: number, x: number, y: number, inPinch: boolean, startX: number, startY: number}[] = [];
  private _pinchZoomState?: {scale: number, translateX: number, translateY: number, diff: number, centerX: number, centerY: number};
  onDown(event: MouseEvent): void {
    if (this.zoomScale > 1) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (event instanceof PointerEvent && event.pointerType === 'touch') {
      this._mouseMove = false;
      this._pointers.push({id: event.pointerId, x: event.screenX, y: event.screenY, inPinch: false, startX: event.layerX, startY: event.layerY});
      if (this._pointers.length === 2) {
        this._pointers[0].inPinch = true;
        this._pointers[1].inPinch = true;
        let x1 = this._pointers[0].startX < this._pointers[1].startX ? this._pointers[0].startX : this._pointers[1].startX;
        let y1 = this._pointers[0].startY < this._pointers[1].startY ? this._pointers[0].startY : this._pointers[1].startY;
        let x2 = this._pointers[0].startX < this._pointers[1].startX ? this._pointers[1].startX : this._pointers[0].startX;
        let y2 = this._pointers[0].startY < this._pointers[1].startY ? this._pointers[1].startY : this._pointers[0].startY;
        this._pinchZoomState = {scale: this.zoomScale, translateX: this.zoomTranslateX, translateY: this.zoomTranslateY, diff: 0, centerX: x1 + (x2 - x1) / 2, centerY: y1 + (y2 - y1) / 2};
      }
    } else if (this.zoomScale > 1) {
      this._mouseMove = true;
    }
  }

  onMove(event: MouseEvent): void {
    if (!this.img) return;
    const image = this.img.nativeElement;
    if (event instanceof PointerEvent && event.pointerType === 'touch') {
      const p = this._pointers.find(p => p.id === event.pointerId);
      if (!p || this._pointers.length > 2) return;
      if (this.zoomScale > 1 || this._pointers.length === 2) {
        event.stopPropagation();
        event.preventDefault();
      }
      if (this._pointers.length === 2) {
        // pinch zoom
        const other = this._pointers.find(p => p.id !== event.pointerId)!;
        let diff = 0;
        if (p.x >= other.x) {
          diff += event.screenX - p.x;
        } else {
          diff -= event.screenX - p.x;
        }
        if (p.y >= other.y) {
          diff += event.screenY - p.y;
        } else {
          diff -= event.screenY - p.y;
        }
        this._pinchZoomState!.diff += diff;
        const scale = 1 + Math.abs(this._pinchZoomState!.diff) * 1.5 / (image.width + image.height);
        if (Math.abs(this._pinchZoomState!.diff) > 1) {
          const centerX = (this._pinchZoomState!.centerX - (-(((image.width * this._pinchZoomState!.scale) - image.width) / 2) + this._pinchZoomState!.translateX)) / this._pinchZoomState!.scale;
          const centerY = (this._pinchZoomState!.centerY - (-(((image.height * this._pinchZoomState!.scale) - image.height) / 2) + this._pinchZoomState!.translateY)) / this._pinchZoomState!.scale;
          if (this._pinchZoomState!.diff > 0) this.zoomIn(image, centerX, centerY, scale);
          else this.zoomOut(image, centerX, centerY, scale);
          this._pinchZoomState!.diff = 0;
        }
        p.x = event.screenX;
        p.y = event.screenY;
      } else if (!p.inPinch) {
        // move
        if (this.zoomScale > 1) {
          this._mouseMove = true;
          this.doMove(image, event.screenX - p.x, event.screenY - p.y);
          p.x = event.screenX;
          p.y = event.screenY;
        }
      }
    } else if (this._mouseMove && this.zoomScale > 1) {
      this.doMove(image, event.movementX, event.movementY);
      event.stopPropagation();
    }
  }

  private doMove(image: HTMLImageElement, diffX: number, diffY: number): void {
    this.applyTranslate(image, this.zoomTranslateX + diffX, this.zoomTranslateY + diffY);
    this.applyZoom(image);
  }

  onUp(event?: MouseEvent): void {
    this._mouseMove = false;
    if (event instanceof PointerEvent && event.pointerType === 'touch') {
      const i = this._pointers.findIndex(p => p.id === event.pointerId);
      if (i >= 0) {
        this._pointers.splice(i, 1);
      }
    }
  }

  onTouch(event: TouchEvent): void {
    if (this._mouseMove || this._pointers.length === 2) {
      event.stopPropagation();
      event.preventDefault();
    }
  }

  private zoomScale = 1;
  private zoomTranslateX = 0;
  private zoomTranslateY = 0;

  zoomIn(image: HTMLImageElement, x: number, y: number, scale: number): void {
    this.zoomScale *= scale;
    if (this.zoomScale <= 1) this.onUp();
    this.centerZoom(image, x, y);
    this.applyZoom(image);
  }

  zoomOut(image: HTMLImageElement, x: number, y: number, scale: number): void {
    this.zoomScale /= scale;
    if (this.zoomScale <= 1) {
      this.onUp();
      this.zoomTranslateX = 0;
      this.zoomTranslateY = 0;
      this.zoomScale = 1;
      this.applyZoom(image);
      return;
    }
    this.centerZoom(image, x, y);
    this.applyZoom(image);
  }

  centerZoom(image: HTMLImageElement, x: number, y: number): void {
    const translateX = ((image.width / 2) - x) * this.zoomScale;
    const translateY = ((image.height / 2) - y) * this.zoomScale;
    this.applyTranslate(image, translateX, translateY);
  }

  applyTranslate(image: HTMLImageElement, translateX: number, translateY: number): void {
    const width = image.width * this.zoomScale;
    const maxWidth = this.maxWidth ?? image.naturalWidth;
    const maxTranslateX = Math.max(0, (width - maxWidth) / 2);
    const minTranslateX = Math.min(0, -(width - maxWidth) / 2);
    this.zoomTranslateX = Math.max(minTranslateX, Math.min(maxTranslateX, translateX));

    const height = image.height * this.zoomScale;
    const maxHeight = this.maxHeight ?? image.naturalHeight;
    const maxTranslateY = Math.max(0, (height - maxHeight) / 2);
    const minTranslateY = Math.min(0, -(height - maxHeight) / 2);
    this.zoomTranslateY = Math.max(minTranslateY, Math.min(maxTranslateY, translateY));
  }

  applyZoom(image: HTMLImageElement): void {
    image.style.transform = 'translateX(' + this.zoomTranslateX + 'px) translateY(' + this.zoomTranslateY + 'px) scale(' + this.zoomScale + ')';
  }

}
