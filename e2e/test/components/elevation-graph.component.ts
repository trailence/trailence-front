import { Component } from './component';
import { IonicButton } from './ionic/ion-button';

export class ElevationGraph extends Component {

  public override async waitDisplayed(resetGetElement?: boolean) {
    await super.waitDisplayed(resetGetElement);
    await browser.waitUntil(() => this.getElement().$('canvas').getAttribute('width').then(a => !!a && parseInt(a) > 0));
  }

  public get tooltip() {
    return this.getElement().$('div.graph-tooltip');
  }

  public get zoomButton() {
    return new IonicButton(this.getElement().parentElement().$('ion-button.zoom-button'));
  }

}
