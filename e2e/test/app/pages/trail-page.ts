import { TrailComponent } from '../../components/trail.component';
import { PageWithHeader } from './page';

export class TrailPage extends PageWithHeader {

  constructor(public readonly owner: string, public readonly uuid: string) {
    super('trail-page');
  }

  protected override expectedUrl(url: string): boolean {
    return url.indexOf('/trail/' + this.owner + '/' + this.uuid) > 0;
  }

  public get trailComponent() { return new TrailComponent(this.getElement().$('app-trail')); }

}
