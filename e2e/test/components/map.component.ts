import { Component } from './component';

export class MapComponent extends Component {

  public get markers() { return this.getElement().$('div.leaflet-pane.leaflet-marker-pane').$$('img'); }

}
