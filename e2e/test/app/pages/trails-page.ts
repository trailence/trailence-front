import { TrailsAndMapComponent } from '../../components/trails-and-map.component';
import { PageWithHeader } from './page';

export class TrailsPage extends PageWithHeader {

  constructor() {
    super('trails-page');
  }

  public get trailsAndMap() { return new TrailsAndMapComponent(this.getElement().$('app-trails-and-map')); }

}
