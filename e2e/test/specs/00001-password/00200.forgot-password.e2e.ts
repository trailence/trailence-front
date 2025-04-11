import { App } from '../../app/app';
import { LoginPage } from '../../app/pages/login-page';
import { ForgotPasswordModal } from '../../components/forgot-password.modal';
import { MailHog } from '../../utils/mailhog';

describe('Forgot password', () => {

  it('Try a bad pasword', async () => {
    App.init();
    const loginPage = await App.start();
    await browser.waitUntil(() => loginPage.loginInput.isDisplayed());
    await loginPage.loginInput.setValue(App.config.username);
    await loginPage.passwordInput.setValue('wrongPassword');
    await loginPage.loginButton.click();
    await browser.waitUntil(() => loginPage.errorMessage.isDisplayed());
    const message = await loginPage.errorMessage.getText();
    expect(message).toBe('Invalid e-mail or password');
  });

  it('Forgot password', async () => {
    const loginPage = new LoginPage();
    await loginPage.forgotPasswordButton.click();
    const modal = new ForgotPasswordModal(await App.waitModal());
    await modal.emailInput.waitDisplayed();
    expect(await modal.emailInput.getValue()).toBe(App.config.username);
    await modal.newPasswordInput.setValue('myNewPassword');
    await modal.newPassword2Input.setValue('myNewPassword');
    const continueButton = await modal.getFooterButtonWithText('Continue');
    await continueButton.click();
    await browser.waitUntil(() => modal.codeInput.getElement().isDisplayed());

    const mh = new MailHog();
    await mh.open(true);
    const mailContent = await mh.openMessageTo(App.config.username);
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

  it('End', async () => await App.end());

});
