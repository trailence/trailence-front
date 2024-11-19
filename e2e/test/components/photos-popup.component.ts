import { ChainablePromiseElement } from 'webdriverio';
import { Component } from './component';
import { IonicButton } from './ionic/ion-button';

export class PhotosPopup extends Component {

  constructor(
    element: ChainablePromiseElement,
    public inPopup: boolean,
  ) {
    super(element);
  }

  public getPhotosCntainers() {
    return this.getElement().$$('div.photos div.photo-container');
  }

  public async close() {
    if (!this.inPopup) return;
    const element = this.getElement().$('ion-footer ion-buttons').$('ion-button=Close');
    await new IonicButton(element).click();
    await browser.waitUntil(() => this.getElement().isDisplayed().then(d => !d));
  }

}
