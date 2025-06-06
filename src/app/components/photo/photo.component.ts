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
              if (this.photo === p)
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
  private readonly _pointers: {id: number, x: number, y: number}[] = [];
  private _pinchZoomStartState?: {scale: number, translateX: number, translateY: number};
  onDown(event: MouseEvent): void {
    if (this.zoomScale > 1) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (event instanceof PointerEvent && event.pointerType === 'touch') {
      this._mouseMove = false;
      this._pointers.push({id: event.pointerId, x: event.layerX, y: event.layerY});
      if (this._pointers.length === 2) {
        this._pinchZoomStartState = {scale: this.zoomScale, translateX: this.zoomTranslateX, translateY: this.zoomTranslateY};
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
      if (this.zoomScale > 1) {
        event.stopPropagation();
        event.preventDefault();
      }
      if (this._pointers.length === 2) {
        // pinch zoom
        const other = this._pointers.find(p => p.id !== event.pointerId)!;
        let diff = 0;
        let centerX, centerY;
        if (p.x >= other.x) {
          diff += event.layerX - p.x;
          centerX = other.x + (event.layerX - other.x) / 2;
        } else {
          diff -= event.layerX - p.x;
          centerX = event.layerX + (other.x - event.layerX) / 2;
        }
        if (p.y >= other.y) {
          diff += event.layerY - p.y;
          centerY = other.y + (event.layerY - other.y) / 2;
        } else {
          diff -= event.layerY - p.y;
          centerY = event.layerY + (other.y - event.layerY) / 2;
        }
        const scale = 1 + Math.abs(diff) * 1.5 / (image.width + image.height);
        if (Math.abs(diff) > 1) {
          centerX = (centerX - (-(((image.width * this._pinchZoomStartState!.scale) - image.width) / 2) + this._pinchZoomStartState!.translateX)) / this._pinchZoomStartState!.scale;
          centerY = (centerY - (-(((image.height * this._pinchZoomStartState!.scale) - image.height) / 2) + this._pinchZoomStartState!.translateY)) / this._pinchZoomStartState!.scale;
          if (diff > 0) this.zoomIn(image, centerX, centerY, scale);
          else this.zoomOut(image, centerX, centerY, scale);
          p.x = event.layerX;
          p.y = event.layerY;
        }
      } else {
        // move
        if (this.zoomScale > 1) {
          this._mouseMove = true;
          this.doMove(image, event.layerX - p.x, event.layerY - p.y);
          p.x = event.layerX;
          p.y = event.layerY;
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
      if (i >= 0) this._pointers.splice(i, 1);
    }
  }

  onTouch(event: TouchEvent): void {
    if (this._mouseMove) {
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
    if (this.zoomScale <= 1) this.onUp();
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
