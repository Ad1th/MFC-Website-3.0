import { test, expect } from '@playwright/test';

/**
 * Regression checks for two fox bugs found in the Gate 2 clips:
 *  1. Embers stayed behind when the rig root moved (overtake, pounce) because the
 *     particles were parented outside the root.
 *  2. A scripted "pounce" click landed on the fox and counted as petting.
 * Runs in the fox sandbox at tier 1 with the panel hidden, so canvas pixels are page pixels.
 *
 * To prove a check can fail, switch its fix off and run it:
 *   FOX_REGRESS=embers-parent  npx playwright test fox-regressions -g embers   (drift checks must fail)
 *   FOX_REGRESS=no-near-radius npx playwright test fox-regressions -g "click"  (pounce check must fail)
 *   FOX_REGRESS=no-hit-radius  npx playwright test fox-regressions -g "hold"   (petting check must fail)
 */

test.describe.configure({ timeout: 90_000 });

/** Ember drift limit as a fraction of the fox's live body length (nose to tail base). */
const DRIFT_FRACTION = 0.03;

async function openSandbox(page, query) {
  const regress = process.env.FOX_REGRESS ? `&regress=${process.env.FOX_REGRESS}` : '';
  await page.goto(`/?sandbox=fox&tier=1&approach=C&panel=0&bloom=0&${query}${regress}`);
  await page.waitForFunction(() => Boolean(window.__fox?.screen?.() && window.__fox?.tracking?.()?.ember), null, { timeout: 60_000 });
  await page.waitForTimeout(1200);
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

const minus = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/**
 * Sample tracking for `ms`. The ember centroid (area-weighted surface samples) and the
 * body centroid (mesh vertices, denser around the head) are different point sets, so
 * they sit a fixed distance apart even at rest. The bug shows up as that offset
 * CHANGING by the root's travel, so drift is measured against the offset at the start.
 */
async function track(page, ms) {
  const start = await page.evaluate(() => window.__fox.tracking());
  const baseline = minus(start.ember, start.body);
  const rootBaseline = minus(start.ember, start.root);
  let worstGap = 0;
  let worstRootGap = 0;
  let travel = 0;
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const t = await page.evaluate(() => window.__fox.tracking());
    worstGap = Math.max(worstGap, distance(minus(t.ember, t.body), baseline));
    worstRootGap = Math.max(worstRootGap, distance(minus(t.ember, t.root), rootBaseline));
    travel = Math.max(travel, distance(t.root, start.root));
    await page.waitForTimeout(80);
  }
  return { worstGap, worstRootGap, travel, bodyLength: start.bodyLength, restOffset: distance(start.ember, start.body) };
}

function report(label, r) {
  const line = `${label}: body length ${r.bodyLength.toFixed(3)}, rest offset ${r.restOffset.toFixed(4)}, max ember drift ${r.worstGap.toFixed(4)} (${((r.worstGap / r.bodyLength) * 100).toFixed(2)}% of body, limit ${DRIFT_FRACTION * 100}%), root travel ${r.travel.toFixed(3)}${process.env.FOX_REGRESS ? `, regress=${process.env.FOX_REGRESS}` : ''}`;
  test.info().annotations.push({ type: 'measurement', description: line });
  console.log(line);
}

test('embers follow the fox while it overtakes', async ({ page }) => {
  await openSandbox(page, 'shot=hero&velocity=900');
  await page.evaluate(() => window.__fox.setVelocity(3400));
  const r = await track(page, 3000);
  report('overtake', r);
  expect(r.travel, 'the fox root should move ahead during overtake').toBeGreaterThan(r.bodyLength * 0.2);
  expect(r.worstGap, 'ember emitter centroid vs skinned body centroid').toBeLessThan(r.bodyLength * DRIFT_FRACTION);
  expect(r.worstRootGap, 'ember emitter centroid vs root').toBeLessThan(r.bodyLength * 0.6);
});

test('embers follow the fox through a pounce', async ({ page }) => {
  await openSandbox(page, 'shot=hero&velocity=0');
  await page.evaluate(() => window.__fox.trigger('pounce', { target: { x: 60, y: 0, z: 90 } }, true));
  const r = await track(page, 1600);
  report('pounce', r);
  expect(r.travel, 'the fox root should move during the pounce').toBeGreaterThan(r.bodyLength * 0.3);
  expect(r.worstGap, 'ember emitter centroid vs skinned body centroid').toBeLessThan(r.bodyLength * DRIFT_FRACTION);
  expect(r.worstRootGap, 'ember emitter centroid vs root').toBeLessThan(r.bodyLength * 0.6);
});

async function watch(page, ms) {
  const seen = { pounce: false, petting: false };
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const s = await page.evaluate(() => window.__fox.state());
    if (s.active?.includes('pounce')) seen.pounce = true;
    if (s.petting) seen.petting = true;
    await page.waitForTimeout(50);
  }
  return seen;
}

test('a click just outside the fox pounces and never pets', async ({ page }) => {
  await openSandbox(page, 'shot=hero&velocity=0');
  const s = await page.evaluate(() => window.__fox.screen());
  const x = s.body.x - (s.radius + 90);
  const y = s.body.y + 40;
  expect(Math.hypot(x - s.body.x, y - s.body.y)).toBeGreaterThan(s.radius);
  expect(Math.hypot(x - s.body.x, y - s.body.y)).toBeLessThan(s.radius + 250);
  await page.mouse.click(x, y);
  const seen = await watch(page, 900);
  expect(seen.pounce, 'pounce fired').toBe(true);
  expect(seen.petting, 'petting never started').toBe(false);
});

test('press and hold on the fox pets and never pounces', async ({ page }) => {
  await openSandbox(page, 'shot=hero&velocity=0');
  const s = await page.evaluate(() => window.__fox.screen());
  await page.mouse.move(s.body.x, s.body.y);
  await page.mouse.down();
  const held = await watch(page, 1000);
  await page.mouse.up();
  const after = await watch(page, 600);
  expect(held.petting, 'petting started while held').toBe(true);
  expect(held.pounce || after.pounce, 'pounce never fired').toBe(false);
});
