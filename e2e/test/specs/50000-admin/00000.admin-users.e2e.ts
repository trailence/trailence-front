import { AdminUsersPage } from '../../admin/admin.users.page';
import { UserModal } from '../../admin/user.modal';
import { App } from '../../app/app';

describe('Admin Users', () => {

  let usersPage: AdminUsersPage;

  it('Login, go to admin', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    expect(await menu.hasAdmin()).toBeTrue();
    const adminPage = await menu.openAdmin();
    usersPage = await adminPage.openUsers();
  });

  it('check myself', async () => {
    const cell = await usersPage.table.searchCellByColumnTitleAndValue('E-Mail', 'user@trailence.org');
    expect(cell).toBeDefined();
    if (cell) {
      await cell.click();
      const userModal = new UserModal(await App.waitModal());
      expect(await userModal.getTitle()).toBe('user@trailence.org');
      await (await userModal.getFooterButtonWithText('Close')).click();
    }
  });

});
