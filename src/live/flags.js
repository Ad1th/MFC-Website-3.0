/**
 * URL flags for testing every branch of live behaviour.
 *   ?debug                      debug HUD and window.__film.stats()
 *   ?tier=0|1|2|3               force a quality tier (tests, benchmarks)
 *   ?still=1                    force still (graphic novel) mode
 *   ?sandbox=fox                fox sandbox (Phase 2)
 *   ?weather=rain|storm|clear|fog|cloudy|drizzle
 *   ?tz=Europe/London           pretend timezone
 *   ?visits=1|3|6               pretend visit count
 *   ?commits=0                  no commit meteors
 *   ?newsletters=0              no newsletters
 *   ?backend=down               act as if the API is unreachable
 */

const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);

const numberOrNull = (value) => {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const flags = Object.freeze({
  debug: params.has('debug'),
  tier: numberOrNull(params.get('tier')),
  still: params.get('still') === '1',
  sandbox: params.get('sandbox'),
  weather: params.get('weather'),
  tz: params.get('tz'),
  visits: numberOrNull(params.get('visits')),
  noCommits: params.get('commits') === '0',
  noNewsletters: params.get('newsletters') === '0',
  backendDown: params.get('backend') === 'down',
});
