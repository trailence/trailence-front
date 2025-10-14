import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { EMPTY, first, Subscription, switchMap, timer } from 'rxjs';
import { Photo } from 'src/app/model/photo';
import { IonSpinner, IonIcon } from "@ionic/angular/standalone";
import { PhotoService } from 'src/app/services/database/photo.service';
import { Console } from 'src/app/utils/console';
import { NetworkService } from 'src/app/services/network/network.service';
import { ChangesDetection } from 'src/app/utils/angular-helpers';
import { NgStyle } from '@angular/common';

@Component({
    selector: 'app-photo',
    templateUrl: './photo.component.html',
    styleUrl: './photo.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
      IonIcon, IonSpinner,
      NgStyle,
    ]
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
  private reloadSubscription?: Subscription;

  private readonly changesDetection: ChangesDetection;

  constructor(
    private readonly photoService: PhotoService,
    changesDetector: ChangeDetectorRef,
    private readonly elementRef: ElementRef,
    private readonly network: NetworkService,
    private readonly ngZone: NgZone,
  ) {
    changesDetector.detach();
    this.changesDetection = new ChangesDetection(ngZone, changesDetector);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['photo']) {
      if (changes['photo'].previousValue !== undefined && changes['photo'].currentValue !== undefined &&
          changes['photo'].previousValue.owner === changes['photo'].currentValue.owner &&
          changes['photo'].previousValue.uuid === changes['photo'].currentValue.uuid)
          return;
      this.subscription?.unsubscribe();
      this.subscription = undefined;
      this.reloadSubscription?.unsubscribe();
      this.reloadSubscription = undefined;
      this.error = false;
      this.setBlob(undefined);
      if (this.photo) {
        const loadPhoto = (photo: Photo, trial: number) => {
          this.ngZone.runOutsideAngular(() => {
            this.subscription = this.photoService.getBlobUrl$(photo).subscribe({
              next: blob => {
                this.setBlob(blob);
              },
              error: e => {
                Console.error('Error loading photo', e);
                this.error = true;
                this.subscription = undefined;
                if (trial > 1 && photo.uuid.startsWith('http')) {
                  this.setBlob({url: photo.uuid});
                  return;
                }
                this.reloadError(loadPhoto, photo, trial + 1);
                this.changesDetection.detectChanges();
              }
            });
          });
        }
        if (this.loadWhenVisible) {
          const p = this.photo;
          const observer = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) {
              observer.disconnect();
              if (this.photo?.uuid === p.uuid && this.photo?.owner === p.owner)
                loadPhoto(p, 1);
            }
          });
          observer.observe(this.elementRef.nativeElement);
        } else {
          loadPhoto(this.photo, 1);
        }
      }
    }
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.reloadSubscription?.unsubscribe();
  }

  private setBlob(blob: {url: string, blobSize?: number} | undefined | null) {
    if (blob) {
      this.blob = blob.url;
      this.blobSize.emit(blob.blobSize);
    } else {
      this.blob = undefined;
    }
    this.changesDetection.detectChanges();
  }

  private reloadError(loader: (photo: Photo, trial: number) => void, photo: Photo, trial: number): void {
    this.reloadSubscription?.unsubscribe();
    let firstInternetCheck = true;
    this.reloadSubscription = this.network.internet$.pipe(
      switchMap(internet => {
        if (firstInternetCheck) {
          firstInternetCheck = false;
          if (!internet) return EMPTY;
          return timer(5000);
        }
        if (!internet) return EMPTY;
        return timer(5000);
      }),
      first(),
    ).subscribe(() => {
      if (this.photo?.owner !== photo.owner || this.photo?.uuid !== photo.uuid) return;
      loader(photo, trial);
    });
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
  private readonly _pointers: Pointer[] = [];
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
        let x1 = Math.min(this._pointers[0].startX, this._pointers[1].startX);
        let y1 = Math.min(this._pointers[0].startY, this._pointers[1].startY);
        let x2 = Math.max(this._pointers[0].startX, this._pointers[1].startX);
        let y2 = Math.max(this._pointers[0].startY, this._pointers[1].startY);
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
        this.doPinchZoom(event, p, image);
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

  private doPinchZoom(event: PointerEvent, p: Pointer, image: HTMLImageElement): void {
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

interface Pointer {id: number, x: number, y: number, inPinch: boolean, startX: number, startY: number};
