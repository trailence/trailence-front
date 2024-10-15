import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonButton, IonFooter, IonButtons, IonCheckbox, IonReorderGroup, IonReorder, ModalController, IonModal, IonTextarea } from "@ionic/angular/standalone";
import { firstValueFrom } from 'rxjs';
import { Photo } from 'src/app/model/photo';
import { PhotoService } from 'src/app/services/database/photo.service';
import { FileService } from 'src/app/services/file/file.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { Progress, ProgressService } from 'src/app/services/progress/progress.service';
import { PhotoComponent } from '../photo/photo.component';
import { Subscriptions } from 'src/app/utils/rxjs/subscription-utils';
import { AuthService } from 'src/app/services/auth/auth.service';
import { BrowserService } from 'src/app/services/browser/browser.service';
import { CompositeOnDone } from 'src/app/utils/callback-utils';

interface PhotoWithInfo {
  photo: Photo;
  selected: boolean;
  editing: string | null;
  blobSize: number | undefined;
}

@Component({
  selector: 'app-photos-popup',
  templateUrl: './photos-popup.component.html',
  styleUrls: ['./photos-popup.component.scss'],
  standalone: true,
  imports: [IonModal, IonReorder, IonReorderGroup, IonCheckbox, IonButtons, IonFooter, IonButton, IonContent, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, CommonModule, PhotoComponent, IonTextarea]
})
export class PhotosPopupComponent  implements OnInit, OnDestroy {

  @Input() owner!: string;
  @Input() trailUuid!: string;
  @Input() popup = true;

  photos: PhotoWithInfo[] = [];

  maxWidth!: number;
  maxHeight!: number;
  width!: number;
  height!: number;
  canEdit = false;
  nbSelected = 0;
  sliderIndex = 0;

  private subscriptions: Subscriptions = new Subscriptions();

  @ViewChild('modalSlider') slider?: IonModal;
  @ViewChild('descriptionEditor') descriptionEditor?: IonTextarea;

  constructor(
    public i18n: I18nService,
    private photoService: PhotoService,
    private fileService: FileService,
    private progressService: ProgressService,
    browser: BrowserService,
    private auth: AuthService,
    private modalController: ModalController,
    private changesDetector: ChangeDetectorRef,
  ) {
    this.updateSize(browser);
    this.subscriptions.add(browser.resize$.subscribe(() => this.updateSize(browser)));
  }

  private updateSize(browser: BrowserService): void {
    this.width = browser.width;
    this.height = browser.height;
    this.maxWidth = Math.min(Math.floor(this.width * 0.9) - 20, 300);
    this.maxHeight = Math.min(Math.floor(this.height * 0.4) - 50, 300);
  }

  ngOnInit() {
    this.subscriptions.add(this.auth.auth$.subscribe(auth => this.canEdit = auth?.email === this.owner));
    this.subscriptions.add(this.photoService.getPhotosForTrail(this.owner, this.trailUuid).subscribe(photos => {
      photos.sort((p1, p2) => p1.index - p2.index);
      this.photos = photos.map(p => {
        return {
          photo: p,
          selected: this.photos?.find(prev => prev.photo.owner === p.owner && prev.photo.uuid === p.uuid)?.selected ?? false,
          editing: this.photos?.find(prev => prev.photo.owner === p.owner && prev.photo.uuid === p.uuid)?.editing ?? null,
          blobSize: this.photos?.find(prev => prev.photo.owner === p.owner && prev.photo.uuid === p.uuid)?.blobSize,
        } as PhotoWithInfo;
      });
      this.nbSelected = this.photos.reduce((p, pi) => p + (pi.selected ? 1 : 0), 0);
      this.changesDetector.detectChanges();
    }));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  close(): void {
    this.modalController.dismiss(null, 'close');
  }

  setSelected(p: PhotoWithInfo, selected: boolean): void {
    if (p.selected === selected) return;
    p.selected = selected;
    if (selected) this.nbSelected++; else this.nbSelected--;
  }

  setAllSelected(selected: boolean): void {
    this.photos.forEach(p => p.selected = selected);
    if (selected) this.nbSelected = this.photos.length; else this.nbSelected = 0;
  }

  addPhotos(): void {
    let photoIndex = this.photos.length + 1;
    this.fileService.openFileDialog({
      types: [
        {
          mime: 'image/jpeg',
          extensions: ['jpg', 'jpeg']
        },
        {
          mime: 'image/png',
          extensions: ['png']
        }
      ],
      multiple: true,
      description: this.i18n.texts.pages.photos_popup.importing,
      onstartreading: (nbFiles: number) => {
        const progress = this.progressService.create(this.i18n.texts.pages.photos_popup.importing, nbFiles);
        progress.subTitle = '0/' + nbFiles;
        return Promise.resolve(progress);
      },
      onfileread: (index: number, nbFiles: number, progress: Progress, filename: string, file: ArrayBuffer) => {
        return firstValueFrom(this.photoService.addPhoto(this.owner, this.trailUuid, filename, photoIndex++, file))
        .then(p => {
          progress.subTitle = '' + (index + 1) + '/' + nbFiles;
          progress.addWorkDone(1);
          return true;
        });
      },
      ondone: (progress: Progress | undefined, result: boolean[], errors: any[]) => {
        progress?.done();
        // TODO display errors
      }
    })
  }

  deleteSelected(): void {
    const photos = this.getSelection();
    const progress = this.progressService.create(this.i18n.texts.pages.photos_popup.deleting, photos.length);
    const done = new CompositeOnDone(() => progress.done());
    photos.forEach(p => this.photoService.delete(p, done.add(() => progress.addWorkDone(1))));
    done.start();
  }

  moveBack(index: number): void {
    const photo = this.photos.splice(index, 1)[0];
    const previous = this.photos[index - 1];
    this.photos.splice(index - 1, 0, photo);
    photo.photo.index--;
    previous.photo.index = photo.photo.index + 1;
    this.photoService.update(photo.photo);
    this.photoService.update(previous.photo);
  }

  moveForward(index: number): void {
    this.moveBack(index + 1);
  }

  private getSelection(): Photo[] {
    return this.photos.filter(p => p.selected).map(p => p.photo);
  }

  openSlider(index: number): void {
    this.sliderIndex = index;
    this.slider?.present();
  }

  editDescription(photo: PhotoWithInfo): void {
    if (!this.canEdit) return;
    photo.editing = photo.photo.description;
    setTimeout(() => {
      if (this.descriptionEditor) this.descriptionEditor.setFocus();
    }, 0);
  }

  descriptionChanging(photo: PhotoWithInfo, text: string | null | undefined): void {
    photo.editing = text ?? null;
  }

  descriptionChanged(photo: PhotoWithInfo, text: string | null | undefined): void {
    if (!photo.editing || !text) return;
    if (photo.photo.description !== photo.editing) {
      photo.photo.description = photo.editing;
      this.photoService.update(photo.photo);
    }
    photo.editing = null;
  }

  exitEditDescription(photo: PhotoWithInfo): void {
    photo.editing = null;
  }

}
