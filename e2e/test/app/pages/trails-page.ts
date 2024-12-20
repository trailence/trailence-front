import { TrailsAndMapComponent } from '../../components/trails-and-map.component';
import { PageWithHeader } from './page';

export enum TrailsPageType {
  COLLECTION,
  SHARE,
  SEARCH,
}

export class TrailsPage extends PageWithHeader {

  constructor(private readonly type: TrailsPageType = TrailsPageType.COLLECTION) {
    super('trails-page');
  }

  public get trailsAndMap() { return new TrailsAndMapComponent(this.getElement().$('app-trails-and-map')); }

  protected override expectedUrl(url: string): boolean {
    switch (this.type) {
      case TrailsPageType.COLLECTION: return url.indexOf('/trails/collection/') > 0 && url.indexOf('/trails/collection/my_trails') < 0;
      case TrailsPageType.SHARE: return url.indexOf('/trails/share/') > 0;
      case TrailsPageType.SEARCH: return url.indexOf('/trails/search') > 0;
    }
  }

}
