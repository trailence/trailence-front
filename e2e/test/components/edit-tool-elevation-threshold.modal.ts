import { IonicRange } from './ionic/ion-range';
import { ModalComponent } from './modal';

export class EditToolElevationThresholdModal extends ModalComponent {

  public get threshold() { return new IonicRange(this.contentElement.$('>>>ion-range.elevation-threshold')); }

  public get distance() { return new IonicRange(this.contentElement.$('>>>ion-range.max-distance')); }

}
