import { Component } from './component';
import { IonicButton } from './ionic/ion-button';
import { PhotosSlider } from './photos-slider.component';

export class PhotosSliderPopup extends Component {

  public get slider() { return new PhotosSlider(this.getElement().$('app-photos-slider')); }

  public async close() {
    await new IonicButton(this.getElement().$('div.closer ion-button')).click();
  }

}
