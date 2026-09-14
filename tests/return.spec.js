import { test, expect } from '@playwright/test';

/**
 * S10 The Return: the form over the reassembled pane. Wrong fields get one mono line (never an
 * alert), a dead backend offers a prefilled mailto, a send plays the fox's delivery run before
 * `received.`, and the honeypot swallows bots without a request.
 */

const PANEL = '[data-scene-index][data-active="true"] [data-region="contact"]';
const MOCK = 'https://api.test';

async function toForm(page, query = '') {
  page.on('dialog', (dialog) => {
    throw new Error(`unexpected dialog: ${dialog.message()}`);
  });
  await page.goto(`/?tier=2&freeze=1&weather=clear${query}`);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ignition ?? null), { timeout: 30_000 }).toBe('done');
  await page.evaluate(() => window.__filmTest.scrollToScene('S10', 0.9));
  await expect.poll(() => page.evaluate(() => window.__filmTest.returnScene?.().formIn ?? 0), { timeout: 30_000 }).toBe(1);
}

async function fill(page, { name = 'Ada Lovelace', email = 'ada@example.org', message = 'hello from the test suite' } = {}) {
  await page.locator(`${PANEL} input[name="name"]`).fill(name);
  await page.locator(`${PANEL} input[name="email"]`).fill(email);
  await page.locator(`${PANEL} textarea[name="message"]`).fill(message);
}

test('S10 a wrong email gets one line and a marked field, no alert', async ({ page }) => {
  test.setTimeout(120_000);
  await toForm(page);
  await fill(page, { email: 'ada@' });
  await page.locator(`${PANEL} textarea[name="message"]`).press('Enter');
  await expect(page.locator(`${PANEL} [role="status"]`).first()).toHaveText('that email looks a little off.');
  await expect(page.locator(`${PANEL} input[name="email"]`)).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator(`${PANEL} input[name="email"]`)).toBeFocused();
});

test('S10 a dead backend offers a prefilled mailto', async ({ page }) => {
  test.setTimeout(120_000);
  await toForm(page, '&backend=down');
  await fill(page);
  await page.locator(`${PANEL} button[type="submit"]`).click();
  const status = page.locator(`${PANEL} [role="status"]`).first();
  await expect(status).toContainText("couldn't send. email us instead:");
  const href = await status.locator('a').getAttribute('href');
  expect(href).toMatch(/^mailto:mozillafirefox@vit\.ac\.in\?subject=.+&body=hello%20from%20the%20test%20suite$/);
});

test('S10 a send plays the delivery run, then says received', async ({ page }) => {
  test.setTimeout(120_000);
  const bodies = [];
  await page.route(`${MOCK}/api/contact`, async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });
  await toForm(page);
  await page.evaluate((base) => {
    window.__filmTest.contactBase = base;
  }, MOCK);
  await fill(page);
  await page.locator(`${PANEL} button[type="submit"]`).click();
  await expect.poll(() => page.evaluate(() => window.__filmTest.returnScene().delivering)).toBe(true);
  await expect(page.locator(`${PANEL} button[type="submit"]`)).toHaveText('on its way');
  await expect(page.locator(PANEL).getByText("received. we'll write back.")).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => window.__filmTest.returnScene())).toMatchObject({ delivering: false, deliveries: 1 });
  expect(bodies).toEqual([{ name: 'Ada Lovelace', email: 'ada@example.org', message: 'hello from the test suite' }]);
});

test('S10 the honeypot blocks bots without a request', async ({ page }) => {
  test.setTimeout(120_000);
  let requests = 0;
  await page.route(`${MOCK}/api/contact`, async (route) => {
    requests += 1;
    await route.fulfill({ status: 200, body: '{}' });
  });
  await toForm(page);
  await page.evaluate((base) => {
    window.__filmTest.contactBase = base;
  }, MOCK);
  await fill(page);
  await page.locator(`${PANEL} input[name="company"]`).fill('Spam Inc', { force: true });
  await page.locator(`${PANEL} button[type="submit"]`).click();
  await expect(page.locator(PANEL).getByText("received. we'll write back.")).toBeVisible({ timeout: 15_000 });
  expect(requests).toBe(0);
  expect(await page.evaluate(() => window.__filmTest.returnScene().deliveries)).toBe(0);
});
