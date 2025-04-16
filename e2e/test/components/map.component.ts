import { App } from '../app/app';
import { Component } from './component';
import { IonicButton } from './ionic/ion-button';
import { IonicRange } from './ionic/ion-range';

export class MapComponent extends Component {

  public async waitReady() {
    await browser.waitUntil(() => this.getElement(true).$('div.leaflet-container div.leaflet-tile-pane div.leaflet-layer div.leaflet-tile-container img').isDisplayed());
  }

  public get markers() { return this.getElement().$('div.leaflet-pane.leaflet-marker-pane').$$('img'); }

  public getControl(className: string) {
    return this.getElement().$('div.leaflet-control-container .' + className);
  }

  public async getZoom() {
    const levelTool = this.getControl('zoom-level-tool');
    const levelSpan = levelTool.$('span.zoom-level');
    return parseInt(await levelSpan.getText());
  }

  public async zoomTo(level: number) {
    let zoom = await this.getZoom();
    if (zoom === level) return;
    const zoomTool = this.getControl('leaflet-control-zoom');
    if (zoom > level) {
      while (zoom > level) {
        await zoomTool.$('.leaflet-control-zoom-out').click();
        await browser.pause(2000); // wait for the animation to be done
        zoom = await this.getZoom();
      }
      expect(zoom).toBe(level);
      return;
    }
    while (zoom < level) {
      await zoomTool.$('.leaflet-control-zoom-in').click();
      await browser.pause(2000); // wait for the animation to be done
      zoom = await this.getZoom();
    }
    expect(zoom).toBe(level);
  }

  public async goTo(lat: number, lng: number, zoom: number) {
    await browser.execute(u => window.location.hash = u, '#zoom=' + zoom + '&center=' + lat + ',' + lng);
    await browser.pause(1500); // wait for the hash to be taken into account
    const newHash = await browser.execute(() => window.location.hash);
    if (newHash.indexOf('zoom=' + zoom) < 0 || newHash.indexOf('center=' + lat + ',' + lng) < 0) {
      // failed, may be the map was still initializing => try again
      await browser.execute(u => window.location.hash = u, '#zoom=' + zoom + '&center=' + lat + ',' + lng);
      await browser.pause(1500); // wait for the hash to be taken into account
    }
  }

  public async fitBounds() {
    await this.getControl('fit-bounds-tool').click();
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

  public async selectLayer(name: string) {
    await this.getControl('layer-tool').click();
    const modal = await App.waitModal();
    await modal.$('div.layer.layer-' + name).isDisplayed();
    await modal.$('div.layer.layer-' + name).click();
    await browser.waitUntil(() => modal.isDisplayed().then(d => !d));
  }

  public async isLayerAvailable(name: string) {
    await this.getControl('layer-tool').click();
    const modal = await App.waitModal();
    await modal.$('div.layer').isDisplayed();
    const result = await modal.$('div.layer.layer-' + name).isExisting();
    await modal.$('ion-radio-group div.layer.selected').click();
    await browser.waitUntil(() => modal.isDisplayed().then(d => !d));
    return result;
  }

  public async toggleBubbles() {
    await this.getControl('bubbles-tool').click();
  }

  public async downloadMapOffline(layers: string[], zoomLevel: number) {
    await this.getControl('download-map-tool').click();
    let modal = undefined;
    try { modal = await App.waitModal(); } catch (e) {}
    if (!modal) {
      await browser.action('pointer').move({x: 3, y: 3, origin: await this.getControl('download-map-tool').getElement()}).pause(50).down().pause(10).up().perform();
      modal = await App.waitModal();
    }
    for (const layerName of layers) {
      const layerContainer = modal.$('>>>div.layer.layer-' + layerName);
      await layerContainer.isDisplayed();
      await layerContainer.click();
    }
    const zoomRange = new IonicRange(modal.$('>>>ion-range[name=max-zoom]'));
    await zoomRange.setValue(zoomLevel);
    await new IonicButton(modal.$('ion-footer').$('>>>ion-button[color=success]')).click();
    await browser.waitUntil(() => modal.isDisplayed().then(d => !d));
    await App.waitNoProgress();
  }

  public get paths() { return this.getElement().$('div.leaflet-pane.leaflet-overlay-pane').$$('path'); }

  public getPathsWithColor(stroke: string) { return this.getElement().$('div.leaflet-pane.leaflet-overlay-pane').$$('path[stroke=' + stroke + ']'); }

  public getPathsWithClass(className: string) { return this.getElement().$('div.leaflet-pane.leaflet-overlay-pane').$$('path.' + className); }

  public async getMapPosition() {
    const location = await this.getElement().getLocation();
    const size = await this.getElement().getSize();
    return {x: location.x, y: location.y, w: size.width, h: size.height};
  }

  public async getPathPosition(pathElement: WebdriverIO.Element) {
    const location = await pathElement.getLocation();
    const size = await pathElement.getSize();
    return {x: location.x, y: location.y, w: size.width, h: size.height};
  }

  public get tiles() { return this.getElement().$$('div.leaflet-container div.leaflet-tile-pane div.leaflet-layer div.leaflet-tile-container img'); }

}
