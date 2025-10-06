import { BinaryContent } from 'src/app/utils/binary-content';

export interface ICameraService {

  canTakePhoto(): Promise<boolean>;

  takePhoto(): Promise<BinaryContent>;

}
