import { Component, Injector, Input, OnInit } from '@angular/core';
import { IonHeader, IonToolbar, IonIcon, IonLabel, IonButtons, IonButton, IonContent, IonFooter, IonTitle, IonInput, ModalController, Platform, ToastController } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { LiveGroupDto } from 'src/app/services/live-group/live-group.service';
import Trailence from 'src/app/services/trailence.service';
import { environment } from 'src/environments/environment';

export function openLiveGroupLinkPopup(injector: Injector, group: LiveGroupDto): void {
  injector.get(ModalController).create({
    component: LiveGroupLinkPopup,
    componentProps: {group}
  }).then(m => m.present());
}

@Component({
  templateUrl: './live-group-link-popup.component.html',
  styleUrl: './live-group-link-popup.component.scss',
  imports: [
    IonHeader, IonToolbar, IonIcon, IonLabel, IonButtons, IonButton, IonContent, IonFooter, IonTitle, IonInput,
  ]
})
export class LiveGroupLinkPopup implements OnInit {

  @Input() group!: LiveGroupDto;

  linkStart = environment.baseUrl + '/live-group/join/';
  canShare: boolean;
  qrCode?: string;

  constructor(
    public readonly i18n: I18nService,
    platform: Platform,
    private readonly toastController: ToastController,
    private readonly modalController: ModalController,
  ) {
    this.canShare = platform.is('capacitor');
  }

  ngOnInit(): void {
    import('qrcode')
    .then(module => {
      const canvas = document.createElement('CANVAS') as HTMLCanvasElement;
      canvas.width = 150;
      canvas.height = 150;
      module.default.toDataURL(canvas, this.linkStart + this.group.slug,
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

  copyLink(): void {
    navigator.clipboard.writeText(this.linkStart + this.group.slug)
    .then(() => this.toastController.create({
      message: this.i18n.texts.pages.trail_link.copied,
      color: 'success',
      duration: 3000,
    }))
    .then(t => t.present());
  }

  shareLink(): void {
    Trailence.share({link: this.linkStart + this.group.slug, title: this.i18n.texts.pages.live_group.title});
  }

  close(): void {
    this.modalController.dismiss();
  }
}
