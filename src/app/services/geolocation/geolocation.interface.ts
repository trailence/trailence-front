import { firstValueFrom, Observable } from 'rxjs';
import { PointDto } from '@trailence/model/dto/point';
import { I18nService } from '../i18n/i18n.service';
import { filterDefined } from '@trailence/utils/rxjs/filter-defined';
import { AlertController } from '@ionic/angular';

export const GEOLOCATION_MAX_AGE = 15000;
export const GEOLOCATION_TIMEOUT = 5000;

export enum GeolocationState {
  DISABLED,
  DENIED,
  ENABLED,
}

export abstract class AbstractGeolocationService {

  constructor(
    protected readonly i18n: I18nService,
    protected readonly alertController: AlertController,
  ) {}

  abstract isNative: boolean;

  abstract waitingForGps$: Observable<boolean>;
  abstract waitingForGps: boolean;

  abstract lastKnownPosition$: Observable<{position: PointDto, timestamp: number} | undefined>;
  abstract lastKnownPosition: {position: PointDto, timestamp: number} | undefined;

  abstract watched$: Observable<PointDto | undefined>;

  abstract getState(): Promise<GeolocationState>;

  abstract getCurrentPosition(): Promise<PointDto>;

  abstract watchPosition(notifMessage: string, listener: (position: PointDto) => void, onerror?: (error: any) => void): void;

  abstract stopWatching(listener: (position: PointDto) => void): void;

  abstract canRequestPermission(): boolean;

  abstract requestPermissions(): Promise<boolean>;

  public needsPermission(showPopupImmediatelyIfDenied = false): Promise<boolean> {
    if (!this.i18n.texts) {
      return firstValueFrom(this.i18n.texts$.pipe(filterDefined())).then(() => this.needsPermission());
    }
    return this.getState()
    .then(state => {
      if (state === GeolocationState.DISABLED) {
        return new Promise((resolve, reject) => {
          this.alertController.create({
            header: this.i18n.texts.trace_recorder.disabled_popup.title,
            message: this.i18n.texts.trace_recorder.disabled_popup.message,
            backdropDismiss: false,
            buttons: [{
              text: this.i18n.texts.buttons.retry,
              role: 'ok',
              handler: () => {
                this.alertController.dismiss();
                this.needsPermission().then(resolve).catch(reject);
              }
            }, {
              text: this.i18n.texts.buttons.cancel,
              role: 'cancel',
              handler: () => {
                this.alertController.dismiss();
                reject(new Error('Geolocation disabled'));
              }
            }]
          }).then(alert => alert.present());
        });
      } else if (state === GeolocationState.DENIED) {
        return new Promise((resolve, reject) => {
          const showPopup = () => {
            this.alertController.create({
              header: this.i18n.texts.trace_recorder.denied_popup.title,
              message: this.i18n.texts.trace_recorder.denied_popup.message,
              backdropDismiss: false,
              buttons: [{
                text: this.i18n.texts.buttons.retry,
                role: 'ok',
                handler: () => {
                  this.alertController.dismiss();
                  this.needsPermission().then(resolve).catch(reject);
                }
              }, {
                text: this.i18n.texts.buttons.cancel,
                role: 'cancel',
                handler: () => {
                  this.alertController.dismiss();
                  reject(new Error('Geolocation access denied by user'));
                }
              }]
            }).then(alert => alert.present());
          };
          if (!showPopupImmediatelyIfDenied && this.canRequestPermission()) {
            this.requestPermissions()
            .then(ok => {
              if (ok) this.needsPermission(true).then(resolve).catch(reject);
              else showPopup();
            })
          } else {
            showPopup();
          }
        });
      } else {
        return true;
      }
    });
  }

}
