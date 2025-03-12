import { App } from '../app/app';
import { IonicButton } from '../components/ionic/ion-button';
import { ModalComponent } from '../components/modal';
import { TestUtils } from '../utils/test-utils';

export class UserModal extends ModalComponent {

  public getRolesDivs() {
    return this.getElement().$('div.roles').$$('div.role');
  }

  public async getRoles() {
    const roles = await this.getRolesDivs().getElements();
    const result: string[] = [];
    for (const role of roles) {
      const span = role.$('span');
      result.push(await span.getText());
    }
    return result;
  }

  public async addRole(role: string) {
    const alert = await TestUtils.retry(async () => {
      await new IonicButton(this.getElement(true), 'div.roles ion-button[color=success]').click();
      return await App.waitAlert();
    }, 3, 1000);
    await alert.setInputValue(role);
    await alert.clickButtonWithRole('ok');
    await alert.notDisplayed();
  }

  public async removeRole(roleName: string) {
    const roles = await this.getRolesDivs().getElements();
    for (const role of roles) {
      const span = role.$('span');
      const name = await span.getText();
      if (name === roleName) {
        await new IonicButton(role, 'ion-button').click();
        await browser.waitUntil(() => role.isDisplayed().then(d => !d));
        return;
      }
    }
    throw new Error('Cannot find role: ' + roleName);
  }

}
