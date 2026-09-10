#!/usr/bin/env node
/**
 * Builds src/content/generated/commits.json from real MFC-VIT GitHub activity:
 *   1. org public events (PushEvent, PullRequestEvent, CreateEvent)
 *   2. recent commits (last 12 months) from each public repo, most recently pushed first
 * Newest first, capped at 40. Uses GITHUB_TOKEN when set; without it, stays well
 * under the 60 requests/hour unauthenticated limit. Never pads: if GitHub returns
 * 5 items, the file holds 5. On a network or API failure the previous file is kept.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORG = 'MFC-VIT';
const CAP = 40;
const API = 'https://api.github.com';
const token = process.env.GITHUB_TOKEN?.trim();
const REQUEST_BUDGET = token ? 200 : 40;
const MIN_REMAINING = 5;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'src/content/generated/commits.json');

let requests = 0;
let remaining = Infinity;

async function gh(pathname) {
  if (requests >= REQUEST_BUDGET) throw new BudgetError(`request budget of ${REQUEST_BUDGET} reached`);
  if (remaining <= MIN_REMAINING) throw new BudgetError(`rate limit nearly exhausted (${remaining} left)`);
  requests += 1;
  const res = await fetch(`${API}${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'mfc-website-build',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  const left = Number(res.headers.get('x-ratelimit-remaining'));
  if (Number.isFinite(left)) remaining = left;
  if (res.status === 409) return []; // empty repository
  if (!res.ok) throw new Error(`${pathname}: HTTP ${res.status}`);
  return res.json();
}

class BudgetError extends Error {}

const isBot = (login = '') => /\[bot\]$/i.test(login);

async function orgEvents() {
  const types = { PushEvent: 'push', PullRequestEvent: 'pull_request', CreateEvent: 'create' };
  const events = await gh(`/orgs/${ORG}/events?per_page=100`);
  return events
    .filter((e) => types[e.type] && !isBot(e.actor?.login))
    .map((e) => ({
      repo: e.repo.name.replace(`${ORG}/`, ''),
      actor: e.actor.login,
      type: types[e.type],
      createdAt: new Date(e.created_at).toISOString(),
    }));
}

async function repoCommits(since) {
  const repos = await gh(`/orgs/${ORG}/repos?type=public&sort=pushed&direction=desc&per_page=100`);
  const active = repos.filter((r) => !r.archived && !r.fork && new Date(r.pushed_at) >= since);
  const items = [];
  for (const repo of active) {
    try {
      const commits = await gh(`/repos/${ORG}/${repo.name}/commits?since=${since.toISOString()}&per_page=${CAP}`);
      for (const c of commits) {
        const actor = c.author?.login ?? c.commit?.author?.name;
        const date = c.commit?.author?.date ?? c.commit?.committer?.date;
        if (!actor || !date || isBot(actor)) continue;
        items.push({ repo: repo.name, actor, type: 'commit', createdAt: new Date(date).toISOString() });
      }
    } catch (err) {
      if (err instanceof BudgetError) {
        console.warn(`fetch-github: stopped at ${repo.name}: ${err.message}`);
        break;
      }
      throw err;
    }
  }
  return { items, repoCount: active.length };
}

/** A push event is redundant when a commit from the same person in the same repo lands within 10 minutes. */
function dedupe(events, commits) {
  const tenMinutes = 10 * 60 * 1000;
  const pushes = events.filter((e) => {
    if (e.type !== 'push') return true;
    const t = Date.parse(e.createdAt);
    return !commits.some((c) => c.repo === e.repo && c.actor === e.actor && Math.abs(Date.parse(c.createdAt) - t) <= tenMinutes);
  });
  const seen = new Set();
  return [...pushes, ...commits].filter((i) => {
    const key = `${i.repo}|${i.actor}|${i.type}|${i.createdAt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);

  const events = await orgEvents();
  const { items: commits, repoCount } = await repoCommits(since);

  const merged = dedupe(events, commits)
    .filter((i) => Date.parse(i.createdAt) >= since.getTime())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, CAP);

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(
    `fetch-github: ${events.length} org events + ${commits.length} commits from ${repoCount} active repos -> wrote ${merged.length} items (${requests} requests, ${token ? 'token' : 'unauthenticated'})`,
  );
}

main().catch((err) => {
  const kept = fs.existsSync(outFile) ? 'kept the previous commits.json' : 'no commits.json exists, Scene 3 shows no threads';
  console.warn(`fetch-github: ${err.message}; ${kept}`);
});
