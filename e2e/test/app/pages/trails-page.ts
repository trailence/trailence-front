import { TrailsAndMapComponent } from '../../components/trails-and-map.component';
import { PageWithHeader } from './page';

export class TrailsPage extends PageWithHeader {

  constructor(private readonly isShare: boolean = false) {
    super('trails-page');
  }

  public get trailsAndMap() { return new TrailsAndMapComponent(this.getElement().$('app-trails-and-map')); }

  protected override expectedUrl(url: string): boolean {
    return this.isShare ? url.indexOf('/trails/share/') > 0 : (url.indexOf('/trails/collection/') > 0 && url.indexOf('/trails/collection/my_trails') < 0);
  }

}
