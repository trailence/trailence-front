import { App } from '../app/app';
import { Component } from './component';
import { IonicButton } from './ionic/ion-button';
import { IonicRange } from './ionic/ion-range';
import { SearchPlace } from './search-place.component';
import { ToolbarComponent } from './toolbar.component';

export class MapComponent extends Component {

  public async waitReady() {
    await browser.waitUntil(() => this.getElement(true).$('div.leaflet-container div.leaflet-tile-pane div.leaflet-layer div.leaflet-tile-container img').isDisplayed());
  }

  public get markers() { return this.getElement().$('div.leaflet-pane.leaflet-marker-pane').$$('img'); }

  public get leftToolbar() { return new ToolbarComponent(this.getElement().$('div.map-left-controls-container app-toolbar')); }
  public get rightToolbar() { return new ToolbarComponent(this.getElement().$('div.map-right-controls-container app-toolbar')); }
  public get topToolbar() { return new ToolbarComponent(this.getElement().$('div.map-top-controls-container app-toolbar')); }

  public async getZoom() {
    const levelTool = this.leftToolbar.getElement().$('div.toolbar-item.disabled ion-label');
    return parseInt(await levelTool.getText());
  }

  public async zoomTo(level: number) {
    let zoom = await this.getZoom();
    if (zoom === level) return;
    if (zoom > level) {
      const zoomOutTool = this.leftToolbar.getButtonByIcon('minus');
      while (zoom > level) {
        await zoomOutTool.click();
        await browser.pause(1000); // wait for the animation to be done
        zoom = await this.getZoom();
      }
      expect(zoom).toBe(level);
      return;
    }
    if (zoom < level) {
      const zoomInTool = this.leftToolbar.getButtonByIcon('plus');
      while (zoom < level) {
        await zoomInTool.click();
        await browser.pause(1000); // wait for the animation to be done
        zoom = await this.getZoom();
      }
    }
    expect(zoom).toBe(level);
  }

  public async goTo(lat: number, lng: number, zoom: number) {
    const search = await this.openSearchTool();
    const result = await search.searchPlace('' + lat + ' ' + lng);
    await result[0].click();
    await this.closeSearchTool();
    await browser.pause(2000); // wait for map to go to the position
    await this.zoomTo(zoom);
  }

  public async openSearchTool() {
    const button = this.topToolbar.getButtonByIcon('search');
    if (await button.isDisplayed()) await button.click();
    const search = new SearchPlace(this.topToolbar.getElement().$('app-search-place'));
    await browser.waitUntil(() => search.getElement().isDisplayed());
    return search;
  }

  public async closeSearchTool() {
    const button = this.topToolbar.getButtonByIcon('chevron-left');
    if (await button.isDisplayed()) await button.click();
  }

  public async fitBounds() {
    await this.leftToolbar.clickByIcon('zoom-fit-bounds');
  }

  public async toggleGeolocation() {
    let button = this.leftToolbar.getButtonByIcon('pin');
    if (await button.isExisting()) await button.click();
    else {
      button = this.leftToolbar.getButtonByIcon('pin-off');
      await button.click();
    }
  }

  public async centerOnGeolocation() {
    await this.leftToolbar.clickByIcon('center-on-location');
  }

  public async hasCenterOnGeolocation() {
    return await this.leftToolbar.getButtonByIcon('center-on-location').isExisting();
  }

  public getGeolocationMarker() {
    return this.getElement().$('div.leaflet-pane.leaflet-overlay-pane path.leaflet-position-marker');
  }

  public async selectLayer(name: string) {
    await this.rightToolbar.clickByIcon('layers');
    const modal = await App.waitModal();
    await browser.waitUntil(() => modal.$('div.layer.layer-' + name).isDisplayed());
    await modal.$('div.layer.layer-' + name).click();
    await browser.waitUntil(() => modal.isDisplayed().then(d => !d));
  }

  public async isLayerAvailable(name: string) {
    await this.rightToolbar.clickByIcon('layers');
    const modal = await App.waitModal();
    await modal.$('div.layer').isDisplayed();
    const result = await modal.$('div.layer.layer-' + name).isExisting();
    await modal.$('ion-radio-group div.layer.selected').click();
    await browser.waitUntil(() => modal.isDisplayed().then(d => !d));
    return result;
  }

  public async toggleBubbles() {
    let button = this.rightToolbar.getButtonByIcon('bubbles');
    if (await button.isExisting()) await button.click();
    else {
      button = this.rightToolbar.getButtonByIcon('path');
      await button.click();
    }
  }

  public async downloadMapOffline(layers: string[], zoomLevel: number) {
    await this.rightToolbar.clickByIcon('download');
    let modal = undefined;
    try { modal = await App.waitModal(); } catch (e) {}
    if (!modal) {
      await browser.action('pointer').move({x: 3, y: 3, origin: await this.rightToolbar.getButtonByIcon('download').getElement()}).pause(50).down().pause(10).up().perform();
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
