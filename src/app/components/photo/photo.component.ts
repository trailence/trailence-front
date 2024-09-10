import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { Subscription } from 'rxjs';
import { Photo } from 'src/app/model/photo';
import { IonSpinner, IonIcon } from "@ionic/angular/standalone";
import { CommonModule } from '@angular/common';
import { PhotoService } from 'src/app/services/database/photo.service';

@Component({
  selector: 'app-photo',
  templateUrl: './photo.component.html',
  styleUrls: ['./photo.component.scss'],
  standalone: true,
  imports: [IonIcon, IonSpinner, CommonModule]
})
export class PhotoComponent implements OnChanges, OnDestroy {

  @Input() maxWidth?: number;
  @Input() maxHeight?: number;
  @Input() photo?: Photo;

  blob?: string;
  error = false;
  private subscription?: Subscription;

  constructor(
    private photoService: PhotoService,
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
      if (!this.photo) this.setBlob(undefined);
      else this.subscription = this.photoService.getFile$(this.photo.owner, this.photo.uuid).subscribe({
        next: blob => {
          this.setBlob(blob);
        },
        error: e => {
          console.log('Error loading photo', e);
          this.error = true;
        }
      });
    }
  }

  ngOnDestroy(): void {
    if (this.blob) URL.revokeObjectURL(this.blob);
  }

  private setBlob(blob: Blob | undefined) {
    if (this.blob) URL.revokeObjectURL(this.blob);
    if (!blob) this.blob = undefined;
    else this.blob = URL.createObjectURL(blob);
  }

}
