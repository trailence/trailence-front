import { Component, Injector, Input, OnDestroy, OnInit } from '@angular/core';
import { of, Subscription, switchMap } from 'rxjs';
import { TrailLinkService } from 'src/app/services/database/link.service';
import { ModalController, IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonFooter, IonButtons, IonButton, IonInput, IonSpinner, ToastController, Platform, AlertController } from '@ionic/angular/standalone';
import { TrailLink } from 'src/app/model/dto/trail-link';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { environment } from 'src/environments/environment';
import { NetworkService } from 'src/app/services/network/network.service';
import { AsyncPipe } from '@angular/common';
import Trailence from 'src/app/services/trailence.service';
import { AuthService } from 'src/app/services/auth/auth.service';

export function openTrailLink(injector: Injector, trailUuid: string) {
  injector.get(ModalController).create({
    component: TrailLinkPopup,
    componentProps: {
      trailUuid,
    },
    cssClass: 'auto-height'
  }).then(m => {
    m.style.setProperty('--width', 'calc(min(95%, 900px))');
    m.present();
  });
}

@Component({
  templateUrl: './trail-link-popup.component.html',
  styleUrl: './trail-link-popup.component.scss',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonFooter, IonButtons, IonButton, IonInput, IonSpinner,
    AsyncPipe,
  ]
})
export class TrailLinkPopup implements OnInit, OnDestroy {

  @Input() trailUuid!: string;

  trailLink?: TrailLink;
  subscription?: Subscription;

  linkStart: string;
  canShare = false;
  qrCode?: string;
  isAnonymous: boolean;

  constructor(
    public readonly i18n: I18nService,
    public readonly network: NetworkService,
    private readonly linkService: TrailLinkService,
    private readonly toastController: ToastController,
    private readonly modalController: ModalController,
    private readonly alertController: AlertController,
    platform: Platform,
    auth: AuthService,
  ) {
    this.linkStart = environment.baseUrl + '/trail/link/';
    this.canShare = platform.is('capacitor');
    this.isAnonymous = !auth.auth || auth.auth?.isAnonymous === false;
  }

  ngOnInit(): void {
    if (this.isAnonymous) return;
    this.subscription = this.linkService.getLinkForTrailReady$(this.trailUuid).pipe(
      switchMap(link => {
        if (link) return of(link);
        return this.linkService.create(this.trailUuid);
      })
    ).subscribe(link => {
      this.trailLink = link || undefined;
      this.qrCode = undefined;
      if (this.trailLink) {
        import('qrcode')
        .then(module => {
          if (!this.trailLink) return;
          const canvas = document.createElement('CANVAS') as HTMLCanvasElement;
          canvas.width = 150;
          canvas.height = 150;
          module.default.toDataURL(canvas, this.linkStart + this.trailLink.link,
            {
              type: 'image/png',
              margin: 1,
              width: 150,
            },
            (e, r) => {
              if (r) this.qrCode = r;
            }
          );
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  copyLink(): void {
    navigator.clipboard.writeText(this.linkStart + this.trailLink!.link)
    .then(() => this.toastController.create({
      message: this.i18n.texts.pages.trail_link.copied,
      color: 'success',
      duration: 3000,
    }))
    .then(t => t.present());
  }

  shareLink(): void {
    Trailence.share({link: this.linkStart + this.trailLink!.link, title: this.i18n.texts.pages.trail_link.share_title});
  }

  async delete() {
    const alert = await this.alertController.create({
      header: this.i18n.texts.pages.trail_link.delete.title,
      message: this.i18n.texts.pages.trail_link.delete.message,
      buttons: [
        {
          text: this.i18n.texts.buttons.yes,
          role: 'danger',
          handler: () => {
            this.subscription?.unsubscribe();
            this.subscription = undefined;
            this.modalController.dismiss();
            alert.dismiss(true);
            this.linkService.delete(this.trailLink!);
          }
        },
        {
          text: this.i18n.texts.buttons.no,
          role: 'cancel'
        }
      ]
    });
    alert.present();
  }

  close(): void {
    this.modalController.dismiss();
  }

}
