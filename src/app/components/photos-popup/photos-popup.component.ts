import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonButton, IonFooter, IonButtons, IonCheckbox, ModalController, IonTextarea, AlertController } from "@ionic/angular/standalone";
import { combineLatest, firstValueFrom, map, of, switchMap } from 'rxjs';
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
import { ErrorService } from 'src/app/services/progress/error.service';
import { Console } from 'src/app/utils/console';
import { TranslatedString } from 'src/app/services/i18n/i18n-string';
import { TrailService } from 'src/app/services/database/trail.service';
import { TrackService } from 'src/app/services/database/track.service';
import { TrackUtils } from 'src/app/utils/track-utils';
import { Track } from 'src/app/model/track';
import { Trail } from 'src/app/model/trail';

interface PhotoWithInfo {
  photo: Photo;
  selected: boolean;
  editing: string | null;
  blobSize: number | undefined;
  positionOnMap: boolean;
}

@Component({
    selector: 'app-photos-popup',
    templateUrl: './photos-popup.component.html',
    styleUrls: ['./photos-popup.component.scss'],
    imports: [
        IonCheckbox,
        IonButtons,
        IonFooter,
        IonButton,
        IonLabel,
        IonIcon,
        IonTitle,
        IonToolbar,
        IonHeader,
        CommonModule,
        PhotoComponent,
        IonTextarea
    ]
})
export class PhotosPopupComponent  implements OnInit, OnDestroy {

  @Input() trail!: Trail;
  @Input() popup = true;
  @Output() positionOnMapRequested = new EventEmitter<Photo>();

  loaded = false;
  photos: PhotoWithInfo[] = [];

  maxWidth!: number;
  maxHeight!: number;
  width!: number;
  height!: number;
  canEdit = false;
  canAdd = false;
  nbSelected = 0;
  sliderIndex = 0;

  private readonly subscriptions: Subscriptions = new Subscriptions();

  @ViewChild('descriptionEditor') descriptionEditor?: IonTextarea;

  constructor(
    public i18n: I18nService,
    private readonly photoService: PhotoService,
    private readonly fileService: FileService,
    private readonly progressService: ProgressService,
    browser: BrowserService,
    private readonly auth: AuthService,
    private readonly modalController: ModalController,
    private readonly changesDetector: ChangeDetectorRef,
    private readonly errorService: ErrorService,
    private readonly trailService: TrailService,
    private readonly trackService: TrackService,
    private readonly alertController: AlertController,
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
    this.subscriptions.add(
      combineLatest([
        this.auth.auth$.pipe(
          switchMap(a => {
            if (a?.email === this.trail.owner)
              return this.trailService.getTrail$(this.trail.uuid, this.trail.owner).pipe(
                switchMap(trail => trail ? this.trackService.getFullTrack$(trail.currentTrackUuid, this.trail.owner) : of(undefined)),
                map(track => ({track, canEdit: true, canAdd: true}))
              );
            return of({track: undefined, canEdit: this.trail.fromModeration, canAdd: false});
          })
        ),
        this.photoService.getTrailPhotos$(this.trail),
      ])
      .subscribe(([at, photos]) => {
        this.canEdit = at.canEdit;
        this.canAdd = at.canAdd;
        photos.sort((p1, p2) => p1.index - p2.index);
        this.photos = photos.map(p => {
          return {
            photo: p,
            selected: this.photos?.find(prev => prev.photo.owner === p.owner && prev.photo.uuid === p.uuid)?.selected ?? false,
            editing: this.photos?.find(prev => prev.photo.owner === p.owner && prev.photo.uuid === p.uuid)?.editing ?? null,
            blobSize: this.photos?.find(prev => prev.photo.owner === p.owner && prev.photo.uuid === p.uuid)?.blobSize,
            positionOnMap: !!this.getPhotoPosition(p, at.track),
          } as PhotoWithInfo;
        });
        this.nbSelected = this.photos.reduce((p, pi) => p + (pi.selected ? 1 : 0), 0);
        this.loaded = true;
        this.changesDetector.detectChanges();
      })
    );
  }

  private readonly _dateToPosCache = new Map<number, L.LatLngLiteral | null>();
  private getPhotoPosition(photo: Photo, track: Track | null | undefined): L.LatLngLiteral | undefined {
    if (photo.latitude !== undefined && photo.longitude !== undefined) {
      const pos = {lat: photo.latitude, lng: photo.longitude};
      if (!track) return pos;
      const ref = TrackUtils.findClosestPointInTrack(pos, track, 100);
      if (ref) return track.segments[ref.segmentIndex].points[ref.pointIndex].pos;
    }
    if (photo.dateTaken !== undefined) {
      let point: L.LatLngLiteral | null | undefined = this._dateToPosCache.get(photo.dateTaken);
      if (point === undefined && track) {
        const closest = TrackUtils.findClosestPointForTime(track, photo.dateTaken);
        point = closest ? {lat: closest.pos.lat, lng: closest.pos.lng} : null;
        this._dateToPosCache.set(photo.dateTaken, point);
      }
      return point ?? undefined;
    }
    return undefined;
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  close(data: Photo | null = null): void {
    this.modalController.dismiss(data, 'close');
  }

  setBlobSize(p: PhotoWithInfo, size: number): void {
    p.blobSize = size;
    this.changesDetector.detectChanges();
  }

  setSelected(p: PhotoWithInfo, selected: boolean): void {
    if (p.selected === selected) return;
    p.selected = selected;
    if (selected) this.nbSelected++; else this.nbSelected--;
    this.changesDetector.detectChanges();
  }

  setAllSelected(selected: boolean): void {
    this.photos.forEach(p => p.selected = selected);
    if (selected) this.nbSelected = this.photos.length; else this.nbSelected = 0;
    this.changesDetector.detectChanges();
  }

  positionOnMap(photo: Photo): void {
    if (this.popup) this.close(photo);
    else this.positionOnMapRequested.emit(photo);
  }

  clearPosition(photo: PhotoWithInfo): void {
    if (!photo.positionOnMap) {
      this.photoService.update(photo.photo, p => { p.latitude = undefined; p.longitude = undefined; });
      return;
    }
    this.alertController.create({
      header: this.i18n.texts.pages.photos_popup.position.clear_title,
      message: this.i18n.texts.pages.photos_popup.position.clear_message,
      buttons: [
        {
          text: this.i18n.texts.buttons.confirm,
          role: 'danger',
          handler: () => {
            this.alertController.dismiss();
            this.photoService.update(photo.photo, p => {
              if (p.latitude !== undefined && p.longitude !== undefined) {
                p.latitude = undefined;
                p.longitude = undefined;
              } else {
                p.dateTaken = undefined;
              }
            });
          }
        }, {
          text: this.i18n.texts.buttons.cancel,
          role: 'cancel'
        }
      ]
    }).then(a => a.present());
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
        if (this.photos.length + nbFiles > 25) {
          return Promise.reject(new Error(new TranslatedString('quota_reached.photos_max_by_trail', [this.photos.length, 25, nbFiles]).translate(this.i18n)));
        }
        const quota = this.photoService.getQuota();
        if (quota.current + nbFiles > quota.max)
          return Promise.reject(new Error(new TranslatedString('quota_reached.photos_max', [quota.max, quota.current, nbFiles]).translate(this.i18n)));
        const progress = this.progressService.create(this.i18n.texts.pages.photos_popup.importing, nbFiles);
        progress.subTitle = '0/' + nbFiles;
        return Promise.resolve(progress);
      },
      onfileread: (index: number, nbFiles: number, progress: Progress, filename: string, file: ArrayBuffer) => {
        return firstValueFrom(this.photoService.addPhoto(this.trail.owner, this.trail.uuid, filename, photoIndex++, file))
        .then(p => {
          progress.subTitle = '' + (index + 1) + '/' + nbFiles;
          progress.addWorkDone(1);
          return true;
        });
      },
      ondone: (progress: Progress | undefined, result: boolean[], errors: any[]) => {
        progress?.done();
        if (errors.length > 0) {
          Console.error('Errors reading photos', errors);
          this.errorService.addErrors(errors);
        };
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
    const newIndex = --photo.photo.index;
    previous.photo.index = newIndex + 1;
    this.photoService.update(photo.photo, p => p.index = newIndex);
    this.photoService.update(previous.photo, p => p.index = newIndex + 1);
  }

  moveForward(index: number): void {
    this.moveBack(index + 1);
  }

  private getSelection(): Photo[] {
    return this.photos.filter(p => p.selected).map(p => p.photo);
  }

  openSlider(index: number): void {
    this.photoService.openSliderPopup(this.photos.map(p => p.photo), index);
  }

  editDescription(photo: PhotoWithInfo): void {
    if (!this.canEdit) return;
    photo.editing = photo.photo.description;
    this.changesDetector.detectChanges();
    setTimeout(() => {
      if (this.descriptionEditor) this.descriptionEditor.setFocus();
    }, 0);
  }

  descriptionChanging(photo: PhotoWithInfo, text: string | null | undefined): void {
    photo.editing = text ?? null;
  }

  descriptionChanged(photo: PhotoWithInfo, text: string | null | undefined): void {
    if (!photo.editing || !text) return;
    if (photo.photo.description !== text) {
      photo.photo.description = text;
      this.photoService.update(photo.photo, p => p.description = text);
    }
    this.exitEditDescription(photo);
  }

  exitEditDescription(photo: PhotoWithInfo): void {
    if (photo.editing === null) return;
    photo.editing = null;
    this.changesDetector.detectChanges();
  }

}
