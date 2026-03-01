import { ChangeDetectorRef, Component, Injector, OnDestroy, OnInit } from '@angular/core';
import { ModalController, IonHeader, IonToolbar, IonTitle, IonLabel, IonContent, IonFooter, IonButtons, IonButton, IonCheckbox, IonIcon } from '@ionic/angular/standalone';
import { map, of, switchMap } from 'rxjs';
import { AVATAR_MAX_SIZE, AVATAR_MIN_SIZE, AvatarService } from 'src/app/services/avatar/avatar.service';
import { FileService } from 'src/app/services/file/file.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { ImageUtils } from 'src/app/utils/image-utils';
import { Subscriptions } from 'src/app/utils/rxjs/subscription-utils';
import { PhotoEditorComponent } from '../photo-editor/photo-editor.component';
import { BinaryContent } from 'src/app/utils/binary-content';
import { Console } from 'src/app/utils/console';
import { ErrorService } from 'src/app/services/progress/error.service';

export async function openEditAvatarPopup(injector: Injector) {
  const modal = await injector.get(ModalController).create({
    component: EditAvatarPopup,
  });
  await modal.present();
}

@Component({
  templateUrl: './edit-avatar-popup.component.html',
  styleUrl: './edit-avatar-popup.component.scss',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonLabel, IonContent, IonFooter, IonButtons, IonButton, IonCheckbox, IonIcon,
    PhotoEditorComponent,
  ]
})
export class EditAvatarPopup implements OnDestroy, OnInit {

  blob?: Blob;
  fromBlob?: Blob;
  isPublic = false;
  blobUpdated = false;
  publicUpdated = false;
  isNewBlob = false;
  saving = false;

  private readonly subscriptions = new Subscriptions();
  private isInit = false;

  constructor(
    public readonly i18n: I18nService,
    private readonly avatarService: AvatarService,
    private readonly fileService: FileService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly modalController: ModalController,
    private readonly errorService: ErrorService,
  ) {
    this.subscriptions.add(
      this.avatarService.getMyAvatarDto$().pipe(
        switchMap(dto => {
          if (dto?.hasPending)
            return this.avatarService.getMyPendingBlob$().pipe(map(blob => ({blob, isPublic: !!dto.pendingPublic})));
          if (dto?.hasAvatar)
            return this.avatarService.getMyCurrentBlob$().pipe(map(blob => ({blob, isPublic: !!dto.avatarPublic})));
          return of({blob: undefined, isPublic: false});
        })
      ).subscribe(result => {
        this.blob = result.blob;
        this.fromBlob = result.blob;
        this.isPublic = result.isPublic;
        this.publicUpdated = false;
        this.blobUpdated = false;
        if (this.isInit) this.refresh();
      })
    );
  }

  ngOnInit(): void {
    this.isInit = true;
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private refresh(): void {
    this.changeDetector.detectChanges();
  }

  setPublic(isPublic: boolean | null | undefined): void {
    if (isPublic === null || isPublic === undefined || this.isPublic === isPublic) return;
    this.isPublic = isPublic;
    this.publicUpdated = true;
    this.refresh();
  }

  onBlobChange(event: {blob: Blob, changed: boolean}): void {
    this.fromBlob = event.blob;
    this.blobUpdated = event.changed;
    this.extractCenter(event.blob).then(small => this.blob = small);
    this.refresh();
  }

  selectFile(): void {
    this.fileService.openFileDialog({
      description: this.i18n.texts.pages.edit_avatar.select_file,
      types: [
        {
          mime: 'image/jpeg',
          extensions: ['jpg', 'jpeg']
        },
        {
          mime: 'image/png',
          extensions: ['png']
        },
        {
          mime: 'image/gif',
          extensions: ['gif']
        }
      ],
      multiple: false,
      onstartreading: () => Promise.resolve(),
      onfileread: (index: number, nbFiles: number, fromStartReading: any, fileName: string, fileContent: ArrayBuffer) => {
        return ImageUtils.convertToJpeg(new Uint8Array(fileContent), 800, 800, 1, AVATAR_MIN_SIZE, AVATAR_MIN_SIZE)
          .then(p => {
            if (p.width > AVATAR_MAX_SIZE || p.height > AVATAR_MAX_SIZE)
              return this.extractCenter(new Blob([new Uint8Array(fileContent)])).then(small => ({small, original: p}));
            return {small: p.blob, original: p};
          });
      },
      ondone: (fromStartReading: any, results: {small: Blob, original: {blob: Blob, width: number, height: number}}[], errors: any[]) => {
        if (results.length > 0) {
          this.fromBlob = results[0].original.blob;
          this.blob = results[0].small;
          this.blobUpdated = true;
          this.isNewBlob = true;
          this.refresh();
        }
      },
    });
  }

  private extractCenter(blob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = document.createElement('IMG') as HTMLImageElement;
      const urlCreator = globalThis.URL || globalThis.webkitURL;
      img.onload = (e) => {
        try {
          const width = img.naturalWidth;
          const height = img.naturalHeight;
          const size = Math.min(width, height);
          const dx = width - size;
          const dy = height - size;

          const canvas = document.createElement('CANVAS') as HTMLCanvasElement;
          canvas.width = AVATAR_MAX_SIZE;
          canvas.height = AVATAR_MAX_SIZE;
          canvas.style.position = 'fixed';
          canvas.style.top = '-1000px';
          canvas.style.left = '-1000px';
          document.documentElement.appendChild(canvas);
          const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
          ctx.drawImage(img, dx / 2, dy / 2, width - dx, height - dy, 0, 0, AVATAR_MAX_SIZE, AVATAR_MAX_SIZE);
          urlCreator.revokeObjectURL(img.src);
          canvas.toBlob(
            b => {
              if (b) {
                if (!!b.arrayBuffer) { // NOSONAR
                  resolve(b);
                } else {
                  try {
                    const base64 = canvas.toDataURL('image/jpeg', 1);
                    BinaryContent.fromDataURL(base64).toBlob().then(b => resolve(b)).
                    catch(e => {
                      Console.warn('Error converting data URL to blob', e);
                      reject('Unable to generate JPEG');
                    });
                  } catch (e) {
                    Console.warn('Error converting blob to JPEG data URL', e);
                    reject('Unable to generate JPEG');
                  }
                }
                canvas.remove();
              } else {
                reject('Unable to generate JPEG');
              }
            },
            "image/jpeg",
            1
          )
        } catch (e) {
          Console.warn('Error converting photo', e);
          reject('Error converting photo');
        }
      };
      img.onerror = err => reject('Error loading photo');
      img.src = urlCreator.createObjectURL(blob);
    });
  }

  close(): void {
    this.modalController.dismiss();
  }

  save(): void {
    this.saving = true;
    this.refresh();
    this.avatarService.save(this.blob!, this.isPublic).subscribe({
      next: () => {
        this.modalController.dismiss();
      },
      error: e => {
        this.saving = false;
        this.refresh();
        this.errorService.addNetworkError(e, 'pages.edit_avatar.error_saving', []);
      }
    });
  }

}
