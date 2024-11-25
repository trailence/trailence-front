import { IonicButton } from '../../components/ionic/ion-button';
import { PageWithHeader } from './page';

export class MyAccountPage extends PageWithHeader {

  constructor() {
    super('myaccount');
  }

  protected override expectedUrl(url: string): boolean {
    return url.indexOf('/myaccount') > 0;
  }

  public get changePasswordButton() { return new IonicButton(this.getElement().$('div.page-content').$('ion-button=Change my password')); }

}
