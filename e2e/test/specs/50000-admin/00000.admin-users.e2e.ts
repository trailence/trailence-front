import { AdminUsersPage } from '../../admin/admin.users.page';
import { UserModal } from '../../admin/user.modal';
import { App } from '../../app/app';
import { TestUtils } from '../../utils/test-utils';

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
    const cell = await TestUtils.retry(() =>
      usersPage.table.searchCellByColumnTitleAndValue('E-Mail', 'user@trailence.org')
      .then(c => { if (c) return c; throw new Error('Cell not found for user@trailence.org'); })
    , 3, 1000);
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
    await TestUtils.retry(async () => {
      const currentRoles = await userModal.getRoles();
      if (currentRoles.length !== 1 || currentRoles[0] !== 'test') throw new Error('Expected role "test", found: ' + currentRoles.join());
    }, 3, 1000);
    await userModal.addRole('second');
    await TestUtils.retry(async () => {
      const currentRoles = await userModal.getRoles();
      if (currentRoles.length !== 2) throw new Error('Expected 2 roles, found: ' + currentRoles.join());
    }, 3, 1000);
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
      expect(tagsQuotas.endsWith('/ 500')).toBeTrue();
    }
    await usersPage.views.setSelected('general');
  });

  it('End', async () => {
    await App.logout(false);
    await App.end();
  });
});
