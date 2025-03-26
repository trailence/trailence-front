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

  it('Reset password is blocked', async () => {
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
    await browser.waitUntil(() => modal.isBlockedByRecentRequest());
    await (await modal.getFooterButtonWithText('Cancel')).click();
    await browser.waitUntil(() => modal.notDisplayed());
  });

  it('Change in database', async () => {
    const childProcess = (browser.options as any)['child_process'];
    const trailence = (browser.options as any)['trailence'];
    let result = childProcess.spawnSync('docker', ['ps', '--filter', 'name=trailence-e2e-db', '-q']);
    const containerId = (result.stdout as Buffer).toString().trim();
    const dbUrl = 'postgresql://' + trailence['dbUsername'] + ':' + trailence['dbPassword'] + '@localhost:5432/trailence';
    result = childProcess.spawnSync('docker', ['container', 'exec', containerId, 'psql', dbUrl, '-c' ,'update users set last_password_email = NULL']);
    expect((result.stdout as Buffer).toString().indexOf('UPDATE')).toBeGreaterThanOrEqual(0);
    expect((result.stderr as Buffer).toString()).toBe('');
  });

  it('Reset password', async () => {
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
    expect(mailContent).toBeDefined();
    await mh.deleteMessage();
    await mh.closeTab();
    let i = mailContent!.indexOf('<h1>');
    let j = mailContent!.indexOf('</h1>', i);
    const code = mailContent!.substring(i + 4, j);
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
