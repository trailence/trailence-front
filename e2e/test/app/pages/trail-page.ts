import { TrailComponent } from '../../components/trail.component';
import { PageWithHeader } from './page';

export class TrailPage extends PageWithHeader {

  constructor() {
    super('trail-page');
  }

  public get trailComponent() { return new TrailComponent(this.getElement().$('app-trail')); }

}
