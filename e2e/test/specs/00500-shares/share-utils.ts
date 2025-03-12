import { AppMenu } from '../../components/app-menu.component';
import { TestUtils } from '../../utils/test-utils';

export async function checkShares(menu: AppMenu, byMe: boolean, expected: string[][]) {
  await TestUtils.retry(async () => {
    const shares = await menu.getShares(byMe ? menu.getSharedByMeSection() : menu.getSharedWithMeSection());
    if (shares.length !== expected.length)
      throw new Error('Expected ' + expected.length + ' shares, found ' + shares.length);
    for (const share of shares) {
      let found = false;
      for (let j = 0; j < expected.length; ++j) {
        if (share[0] === expected[j][0] && share[1] === expected[j][1]) {
          expected.splice(j, 1);
          found = true;
          break;
        }
      }
      if (!found) throw new Error('Share not expected: ' + share[0] + ' with ' + share[1]);
    }
  }, 2, 5000);
}