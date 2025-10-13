import { BinaryContent } from 'src/app/utils/binary-content';

export interface ICameraService {

  canTakePhoto(): Promise<boolean>;

  takePhoto(latitude: number | undefined, longitude: number | undefined): Promise<BinaryContent>;

}
