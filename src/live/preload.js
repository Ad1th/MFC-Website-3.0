/**
 * S00's counter, measured in real bytes. The film's heavy assets are fetched up front as
 * streams, counting bytes as they arrive; the browser's HTTP cache then serves the same
 * responses to three's loaders, so nothing downloads twice. Sizes come from
 * Content-Length when the server sends it, otherwise from the manifest's expected size,
 * and the total is corrected to the real byte count as each file finishes.
 *
 * `onProgress(percent)` gets an integer 0 to 100 and reaches 100 exactly once, when every
 * file has finished (or failed: a missing asset must not hold the film hostage; its
 * loader will report the error itself).
 */

/**
 * @param {number} tier
 * @returns {{ url: string, expected: number }[]} expected sizes in bytes (update if assets change)
 */
export function filmManifest(tier) {
  const earth = tier >= 3 ? 4096 : 2048;
  return [
    { url: '/models/fox.glb', expected: 233_000 },
    { url: `/textures/earth/day-${earth}.webp`, expected: tier >= 3 ? 527_000 : 171_000 },
    { url: `/textures/earth/night-${earth}.webp`, expected: tier >= 3 ? 155_000 : 43_000 },
    { url: '/fonts/mozilla-headline.woff2', expected: 21_000 },
    { url: '/fonts/fira-code.woff2', expected: 36_000 },
  ];
}

/**
 * @param {{ url: string, expected: number }[]} manifest
 * @param {(percent: number) => void} onProgress
 * @param {{ signal?: AbortSignal, onBytes?: (loaded: number, total: number) => void }} [options]
 *   onBytes fires on every chunk with raw byte counts, so a caller can combine sources
 * @returns {Promise<{ bytes: number, failed: string[] }>}
 */
export async function preload(manifest, onProgress, { signal, onBytes } = {}) {
  const totals = manifest.map((item) => item.expected);
  const loaded = manifest.map(() => 0);
  const failed = [];
  let last = -1;

  const report = (done) => {
    const total = totals.reduce((a, b) => a + b, 0) || 1;
    const got = loaded.reduce((a, b) => a + b, 0);
    onBytes?.(got, total);
    // Never show 100 until everything has actually finished.
    const percent = done ? 100 : Math.min(99, Math.floor((got / total) * 100));
    if (percent > last) {
      last = percent;
      onProgress(percent);
    }
  };

  await Promise.all(
    manifest.map(async (item, i) => {
      try {
        const response = await fetch(item.url, { signal });
        if (!response.ok) throw new Error(`${response.status}`);
        const length = Number(response.headers.get('content-length'));
        if (length > 0) totals[i] = length;
        if (!response.body) {
          const buffer = await response.arrayBuffer();
          loaded[i] = buffer.byteLength;
        } else {
          const reader = response.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            loaded[i] += value.byteLength;
            if (loaded[i] > totals[i]) totals[i] = loaded[i];
            report(false);
          }
        }
        totals[i] = loaded[i];
      } catch (error) {
        if (signal?.aborted) throw error;
        failed.push(item.url);
        totals[i] = loaded[i];
      }
      report(false);
    }),
  );

  report(true);
  return { bytes: loaded.reduce((a, b) => a + b, 0), failed };
}

/**
 * The film's JavaScript counts too, but only what arrives after the counter exists: files
 * that finished before it mounted are already here and must not read as progress still to
 * show. Script and module-preload downloads are read from resource timing as each file
 * completes (bytes on the wire, `encodedBodySize`). There is no forecast for scripts; the
 * asset manifest carries the expected total.
 * @param {(loaded: number) => void} onBytes
 * @returns {() => void} stop watching
 */
export function watchScriptBytes(onBytes) {
  if (typeof PerformanceObserver === 'undefined') return () => {};
  const since = performance.now();
  const seen = new Set();
  let loaded = 0;
  const take = (entries) => {
    let changed = false;
    for (const entry of entries) {
      if (seen.has(entry.name) || entry.responseEnd <= since || !/\.m?js(\?|$)/.test(entry.name)) continue;
      seen.add(entry.name);
      loaded += entry.encodedBodySize || entry.transferSize || 0;
      changed = true;
    }
    if (changed) onBytes(loaded);
  };
  const observer = new PerformanceObserver((list) => take(list.getEntries()));
  observer.observe({ type: 'resource', buffered: false });
  return () => observer.disconnect();
}
