import { App } from '../../app/app';
import { LoginPage } from '../../app/pages/login-page';
import { MyAccountPage } from '../../app/pages/my-account-page';
import { TrailsPage } from '../../app/pages/trails-page';
import { ChangePasswordModal } from '../../components/change-password.modal';
import { MailHog } from '../../utils/mailhog';

describe('Reset password', () => {

  let trailsPage: TrailsPage;

  it('Login with new password', async () => {
    App.init();
    const loginPage = await App.start();
    trailsPage = await loginPage.loginAndWaitMyTrailsCollection(App.config.initUsername, 'myNewPassword');
  });

  let accountPage: MyAccountPage;

  it('Reset password', async () => {
    const menu = await trailsPage.header.openUserMenu();
    await menu.clickMyAccount();
    accountPage = new MyAccountPage();
    await accountPage.waitDisplayed();
    await browser.waitUntil(() => accountPage.changePasswordButton.isDisplayed());
    await accountPage.changePasswordButton.click();
    const modal = new ChangePasswordModal(await App.waitModal());
    await modal.currentPasswordInput.setValue('myNewPassword');
    await modal.newPasswordInput.setValue(App.config.initUserpass);
    await modal.newPassword2Input.setValue(App.config.initUserpass);
    const continueButton = await modal.getFooterButtonWithText('Continue');
    await continueButton.click();
    await browser.waitUntil(() => modal.codeInput.getElement().isDisplayed());

    const mh = new MailHog();
    await mh.open(true);
    const mailContent = await mh.openMessageTo(App.config.initUsername);
    await mh.deleteMessage();
    await mh.closeTab();
    let i = mailContent.indexOf('<h1>');
    let j = mailContent.indexOf('</h1>', i);
    const code = mailContent.substring(i + 4, j);
    await modal.codeInput.setValue(code);
    await (await modal.getFooterButtonWithText('Continue')).click();
    await browser.waitUntil(() => modal.notDisplayed());
  });

  it('Logout then login with new password', async () => {
    const userMenu = await accountPage.header.openUserMenu();
    expect(await userMenu.isDisplayed()).toBeTrue();
    const logoutPopup = await userMenu.clickLogout();
    await logoutPopup.clickKeepData();
    const loginPage = new LoginPage();
    await loginPage.waitDisplayed();
    await loginPage.loginAndWaitMyTrailsCollection();
  });

});
