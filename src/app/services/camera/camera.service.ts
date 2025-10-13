import { Injectable } from '@angular/core';
import { ICameraService } from './camera.interface';
import { BinaryContent } from 'src/app/utils/binary-content';

@Injectable({
  providedIn: 'root'
})
export class CameraService implements ICameraService {

  canTakePhoto(): Promise<boolean> {
    return Promise.resolve(false);
  }

  takePhoto(latitude: number | undefined, longitude: number | undefined): Promise<BinaryContent> {
    return Promise.reject('not supported');
  }
}
