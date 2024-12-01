import { Component } from './component';
import { IonicButton } from './ionic/ion-button';

export class EditTools extends Component {

  public async close() {
    await new IonicButton(this.getElement().$('ion-header ion-toolbar').$('>>>ion-button')).click();
  }

  public async backToOriginalTrack() {
    await new IonicButton(this.getElement().$('ion-item.button-back-to-original-track')).click();
  }

  public async joinArrivalToDeparture() {
    await new IonicButton(this.getElement().$('ion-item.button-join-arrival-to-departure')).click();
  }

  public async undo() {
    await this.getElement().$('app-icon-label-button[icon=undo]').click();
  }

}
