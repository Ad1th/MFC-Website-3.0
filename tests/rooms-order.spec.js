import { test, expect } from '@playwright/test';

/**
 * S04 accept: the branch choice changes the room order. The cursor's third at the packet's split
 * sets the film store's branchOrder; S05 plays its rooms in that order. This sets each order the
 * cursor can choose and checks which room is playing in each third of S05.
 */

const ORDERS = [
  ['technical', 'design', 'management'],
  ['design', 'management', 'technical'],
  ['management', 'technical', 'design'],
];

test('S05 plays its rooms in the order chosen at the split', async ({ page }) => {
  await page.goto('/?tier=2&freeze=1&weather=clear');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.filmReady ?? null)).toBe('true');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ignition ?? null), { timeout: 20_000 }).toBe('done');
  await page.evaluate(() => window.__filmTest.scrollToScene('S05', 0.1));
  await expect.poll(() => page.evaluate(() => typeof window.__filmTest.roomAt === 'function'), { timeout: 20_000 }).toBe(true);

  for (const order of ORDERS) {
    await page.evaluate((o) => window.__filmTest.setBranchOrder(o), order);
    const seen = [];
    for (const progress of [0.15, 0.5, 0.85]) {
      await page.evaluate((p) => window.__filmTest.scrollToScene('S05', p), progress);
      await expect.poll(() => page.evaluate(() => window.__filmTest.state().scene)).toBe('S05');
      seen.push(await page.evaluate(() => window.__filmTest.roomAt()));
    }
    expect(seen).toEqual(order);
  }
});
