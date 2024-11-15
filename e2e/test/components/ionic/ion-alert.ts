import { Component } from '../component';

export class IonicAlert extends Component {

  public get buttons() { return this.getElement().$$('.alert-button-group>button'); }

  public async clickButtonWithRole(role: string) {
    const button = this.getElement().$('.alert-button-group>button.alert-button-role-' + role);
    await button.waitForDisplayed();
    await button.click();
  }

}
