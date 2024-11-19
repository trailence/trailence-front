import { TrailComponent } from '../../components/trail.component';
import { PageWithHeader } from './page';

export class TrailPage extends PageWithHeader {

  constructor(private owner: string, private uuid: string) {
    super('trail-page');
  }

  protected getExpectedUrl(): string {
    return '/trail/' + this.owner + '/' + this.uuid;
  }

  public get trailComponent() { return new TrailComponent(this.getElement().$('app-trail')); }

}
