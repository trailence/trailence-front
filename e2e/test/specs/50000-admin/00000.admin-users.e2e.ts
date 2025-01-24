import { AdminUsersPage } from '../../admin/admin.users.page';
import { UserModal } from '../../admin/user.modal';
import { App } from '../../app/app';

describe('Admin Users', () => {

  let usersPage: AdminUsersPage;
  let userModal: UserModal;

  it('Login, go to admin', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    expect(await menu.hasAdmin()).toBeTrue();
    const adminPage = await menu.openAdmin();
    usersPage = await adminPage.openUsers();
  });

  it('Order by email', async () => {
    await usersPage.table.clickColumnByIndex(0);
  });

  it('Open myself', async () => {
    const cell = await usersPage.table.searchCellByColumnTitleAndValue('E-Mail', 'user@trailence.org');
    expect(cell).toBeDefined();
    if (cell) {
      await cell.click();
      userModal = new UserModal(await App.waitModal());
      expect(await userModal.getTitle()).toBe('user@trailence.org');
    }
  });

  it('Add me 2 roles', async () => {
    if (!userModal) return;
    await userModal.addRole('test');
    await userModal.addRole('second');
    await (await userModal.getFooterButtonWithText('Close')).click();
    const cell = await usersPage.table.searchCellByColumnTitleAndValue('E-Mail', 'user@trailence.org');
    const rolesIndex = await usersPage.table.searchColumnIndexByTitle('Roles');
    expect(cell).toBeDefined();
    if (cell) {
      expect(await cell.parentElement().$$('td')[rolesIndex].getText()).toBe('test,second');
      await cell.click();
      userModal = new UserModal(await App.waitModal());
      expect(await userModal.getTitle()).toBe('user@trailence.org');
    }
  });

  it('Remove my roles', async () => {
    const currentRoles = await userModal.getRoles();
    expect(currentRoles.length).toBe(2);
    expect(currentRoles).toContain('test');
    expect(currentRoles).toContain('second');
    await userModal.removeRole('test');
    await userModal.removeRole('second');
    await (await userModal.getFooterButtonWithText('Close')).click();
    const cell = await usersPage.table.searchCellByColumnTitleAndValue('E-Mail', 'user@trailence.org');
    const rolesIndex = await usersPage.table.searchColumnIndexByTitle('Roles');
    expect(cell).toBeDefined();
    if (cell) {
      expect(await cell.parentElement().$$('td')[rolesIndex].getText()).toBe('');
    }
  });

  it('Switch to quotas view, back to general', async () => {
    await usersPage.views.setSelected('quotas');
    const tagsIndex = await usersPage.table.searchColumnIndexByTitle('Tags');
    const cell = await usersPage.table.searchCellByColumnTitleAndValue('E-Mail', 'user@trailence.org');
    expect(cell).toBeDefined();
    if (cell) {
      const tagsQuotas = await cell.parentElement().$$('td')[tagsIndex].getText();
      expect(tagsQuotas.endsWith('/ 1000')).toBeTrue();
    }
    await usersPage.views.setSelected('general');
  });

});
