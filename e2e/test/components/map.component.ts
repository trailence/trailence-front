import { Component } from './component';

export class MapComponent extends Component {

  public async waitReady() {
    await browser.waitUntil(() => this.getElement(true).$('div.leaflet-container div.leaflet-tile-pane div.leaflet-layer div.leaflet-tile-container img').isDisplayed());
  }

  public get markers() { return this.getElement().$('div.leaflet-pane.leaflet-marker-pane').$$('img'); }

  public getControl(className: string) {
    return this.getElement().$('div.leaflet-control-container .' + className);
  }

  public async toggleGeolocation() {
    await this.getControl('show-position-tool').click();
  }

  public async centerOnGeolocation() {
    await this.getControl('center-on-location-tool').click();
  }

  public getGeolocationMarker() {
    return this.getElement().$('div.leaflet-pane.leaflet-overlay-pane path.leaflet-position-marker');
  }

}
