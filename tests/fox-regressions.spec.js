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

test('sleep rests on the floor within 0.2 model units', async ({ page }) => {
  await openSandbox(page, 'shot=hero&velocity=0&mood=sleep');
  // Sample the settled pose, not the blend into it: a fixed wait sampled mid-blend on slow
  // first frames (readings of -0.35 and -0.7). The lowest point during the blend is still
  // measured and reported, because a dip through the floor while lying down would show in the film.
  const blendLows = [];
  await expect
    .poll(
      async () => {
        const fox = (await page.evaluate(() => window.__fox.state())).fox;
        blendLows.push(fox.lowestY);
        return fox.pose.sleep;
      },
      { timeout: 15_000, intervals: [100] },
    )
    .toBeGreaterThanOrEqual(0.99);
  await page.waitForTimeout(500);
  const lows = [];
  for (let i = 0; i < 20; i += 1) {
    lows.push((await page.evaluate(() => window.__fox.state())).fox.lowestY);
    await page.waitForTimeout(100);
  }
  const blendMin = blendLows.length ? Math.min(...blendLows) : null;
  const line = `sleep lowest skinned vertex: min ${Math.min(...lows)}, max ${Math.max(...lows)} model units (floor 0, tolerance 0.2); lowest while blending into sleep ${blendMin}`;
  test.info().annotations.push({ type: 'measurement', description: line });
  console.log(line);
  expect(Math.min(...lows)).toBeGreaterThanOrEqual(-0.2);
  expect(Math.max(...lows)).toBeLessThanOrEqual(0.2);
});

test('a scene-scripted pose holds while every behaviour is triggered', async ({ page }) => {
  await openSandbox(page, 'shot=hero&velocity=0&mood=sit');
  const names = await page.evaluate(() => {
    window.__fox.setScripted(true);
    return ['tilt', 'sneeze', 'playBow', 'pounce', 'shakeOff', 'offended', 'yawn', 'wag', 'tailThump', 'tuckTail', 'glanceBack', 'pawTwitch'];
  });
  for (const name of names) {
    await page.evaluate((n) => window.__fox.trigger(n, {}, false), name);
  }
  await page.waitForTimeout(300);
  const whileScripted = (await page.evaluate(() => window.__fox.state())).active;
  const leaked = whileScripted.filter((n) => names.includes(n));
  expect(leaked, 'no standalone behaviour runs during a scripted pose').toEqual([]);
  // The same trigger works once the script releases, so the check is not vacuous.
  await page.evaluate(() => {
    window.__fox.setScripted(false);
    window.__fox.trigger('tilt', { dir: 1 }, true);
  });
  await page.waitForTimeout(100);
  expect((await page.evaluate(() => window.__fox.state())).active).toContain('tilt');
});

test('a fast cursor sweep pushes the flames away from the pointer', async ({ page }) => {
  await openSandbox(page, 'shot=hero&velocity=0');
  const s = await page.evaluate(() => window.__fox.screen());
  const sweep = async (from, to) => {
    await page.mouse.move(from, s.head.y - 40);
    await page.mouse.move(to, s.head.y - 40, { steps: 6 });
    return page.evaluate(() => ({ world: window.__fox.wind(), uniform: window.__fox.state().fox.wind }));
  };
  const rightward = await sweep(s.body.x - 500, s.body.x + 500);
  await page.waitForTimeout(800);
  const leftward = await sweep(s.body.x + 500, s.body.x - 500);
  const length = (v) => Math.hypot(...v);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const line = `wind after rightward sweep ${JSON.stringify(rightward)}, after leftward sweep ${JSON.stringify(leftward)}`;
  test.info().annotations.push({ type: 'measurement', description: line });
  console.log(line);
  expect(length(rightward.uniform), 'the flame shader receives wind').toBeGreaterThan(0.05);
  expect(length(leftward.uniform), 'the flame shader receives wind').toBeGreaterThan(0.05);
  expect(dot(rightward.world, leftward.world), 'opposite sweeps push the flames opposite ways').toBeLessThan(0);
});

test('a pounce lands on the click point', async ({ page }) => {
  await openSandbox(page, 'shot=hero&velocity=0');
  const s = await page.evaluate(() => window.__fox.screen());
  const start = await page.evaluate(() => window.__fox.tracking());
  // Pick a click just outside the fox whose ground point is well inside the 1.5 m cap,
  // so this measures landing accuracy rather than the cap.
  let click = null;
  for (const dy of [140, 110, 80, 50, 20]) {
    for (const dx of [-(s.radius + 60), s.radius + 60, -(s.radius + 30), s.radius + 30]) {
      const x = s.body.x + dx;
      const y = s.body.y + dy;
      const dist = Math.hypot(dx, dy);
      if (dist <= s.radius || dist >= s.radius + 250) continue;
      const g = await page.evaluate(([px, py]) => window.__fox.groundAt(px, py), [x, y]);
      if (g && Math.hypot(g.x - start.root.x, g.z - start.root.z) < 1.2) {
        click = { x, y };
        break;
      }
    }
    if (click) break;
  }
  expect(click, 'found an in-range click point outside the fox').not.toBeNull();
  await page.mouse.click(click.x, click.y);
  await page.waitForTimeout(1500);
  const target = await page.evaluate(() => window.__fox.lastPounce());
  const t = await page.evaluate(() => window.__fox.tracking());
  const miss = Math.hypot(t.root.x - target.x, t.root.z - target.z);
  const line = `pounce landing: root (${t.root.x.toFixed(3)}, ${t.root.z.toFixed(3)}) vs click (${target.x.toFixed(3)}, ${target.z.toFixed(3)}), miss ${miss.toFixed(3)} = ${((miss / t.bodyLength) * 100).toFixed(1)}% of body, capped ${target.clamped}`;
  test.info().annotations.push({ type: 'measurement', description: line });
  console.log(line);
  expect(target.clamped, 'the chosen click is inside the 1.5 m cap').toBe(false);
  expect(miss, 'lands within 10% of body length of the click').toBeLessThan(t.bodyLength * 0.1);
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
