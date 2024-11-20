import { Component } from './component';
import { IonicToggle } from './ionic/ion-toggle';

export class ToggleChoice extends Component {

  public async selectValue(value1: boolean) {
    const toggle = new IonicToggle(this.getElement().$('ion-toggle'));
    await toggle.setValue(value1);
  }

}
