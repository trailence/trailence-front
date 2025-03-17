import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { Subscription } from 'rxjs';
import { Photo } from 'src/app/model/photo';
import { IonSpinner, IonIcon } from "@ionic/angular/standalone";
import { CommonModule } from '@angular/common';
import { PhotoService } from 'src/app/services/database/photo.service';
import { Console } from 'src/app/utils/console';

@Component({
    selector: 'app-photo',
    templateUrl: './photo.component.html',
    styleUrls: [],
    imports: [IonIcon, IonSpinner, CommonModule]
})
export class PhotoComponent implements OnChanges, OnDestroy {

  @Input() maxWidth?: number;
  @Input() maxHeight?: number;
  @Input() photo?: Photo;
  @Input() loadWhenVisible = false;

  @Output() blobSize = new EventEmitter<number>();

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

}
