import { Injectable } from '@angular/core';
import { ICameraService } from 'src/app/services/camera/camera.interface';
import { Camera, CameraResultType, CameraSource, ImageOptions } from '@capacitor/camera';
import { BinaryContent } from 'src/app/utils/binary-content';
import Trailence from '../trailence.service';
import { Console } from 'src/app/utils/console';

@Injectable({
  providedIn: 'root'
})
export class CameraService implements ICameraService {

  private _canTakePhoto?: boolean;

  constructor() {
    this.canTakePhoto(); // early check
  }

  canTakePhoto(): Promise<boolean> {
    if (this._canTakePhoto !== undefined) return Promise.resolve(this._canTakePhoto);
    return Trailence.canTakePhoto({}).then(result => {
      Console.info('Device can take photo = ', result.canTakePhoto);
      this._canTakePhoto = result.canTakePhoto;
      return this._canTakePhoto;
    });
  }

  takePhoto(latitude: number | undefined, longitude: number | undefined): Promise<BinaryContent> {
    return Camera.getPhoto({
      resultType: CameraResultType.Base64,
      saveToGallery: true,
      source: CameraSource.Camera,
      correctOrientation: false,
      allowEditing: false,
      quality: 90,
      latitude, longitude
    } as ImageOptions).then(result => {
      if (!result.base64String) return Promise.reject('no photo taken');
      return new BinaryContent(result.base64String, 'image/jpeg');
    });
  }
}
