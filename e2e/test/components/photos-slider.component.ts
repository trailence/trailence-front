import { Component } from './component';
import { IonicButton } from './ionic/ion-button';

export class PhotosSlider extends Component {

  public get movePreviousButton() { return new IonicButton(this.getElement().$('.left-side ion-button')); }
  public get moveNextButton() { return new IonicButton(this.getElement().$('.right-side ion-button')); }

}
