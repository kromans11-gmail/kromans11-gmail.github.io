#!/usr/bin/env node
/**
 * Daily publish: drain the submission queue into the catalog.
 *
 * The queue is every open issue labeled `app-submission` + `checks-passed`
 * (the validate-submission workflow grants that label). Once a day this
 * script, run by .github/workflows/daily-publish.yml:
 *
 *   1. parses each queued issue's form fields (name, URL, category, tagline,
 *      description, self-declared capabilities),
 *   2. infers the "offline" capability when the landing page registers a
 *      service worker,
 *   3. adds the app through scripts/curate.mjs (which re-runs the listing
 *      checks — a site that died in the queue is rejected here),
 *   4. comments on and closes each issue (published) or returns it to
 *      checks-failed (submitter can edit to requeue),
 *   5. writes digest.md (the curator's daily review digest) and
 *      new-slugs.txt (for the screenshots step) to the working directory.
 *
 * Published entries are always verified:false — community listings carry the
 * "at your own risk" label; the verified badge stays a manual decision.
 *
 * Env:
 *   GH_TOKEN            GitHub token (required unless DRY_RUN)
 *   GITHUB_REPOSITORY   owner/repo (required unless ISSUES_FILE)
 *   ISSUES_FILE         read the queue from a JSON file instead of the API
 *   DRY_RUN             "1": don't comment/close issues, just report
 */
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const SCRIPTS_DIR = new URL('.', import.meta.url);
const CAPABILITIES_PATH = new URL('../src/data/capabilities.ts', import.meta.url);
const ASTRO_CONFIG_PATH = new URL('../astro.config.mjs', import.meta.url);

const DRY_RUN = process.env.DRY_RUN === '1';
const TOKEN = process.env.GH_TOKEN ?? '';
const REPO = process.env.GITHUB_REPOSITORY ?? '';

const SITE =
  (await readFile(ASTRO_CONFIG_PATH, 'utf8')).match(/site:\s*'([^']+)'/)?.[1] ??
  'https://webappfinder.app';

// label -> key, from the single source of truth in src/data/capabilities.ts
const CAPABILITY_KEY_BY_LABEL = Object.fromEntries(
  [...(await readFile(CAPABILITIES_PATH, 'utf8')).matchAll(/^\s*'?([a-z-]+)'?:\s*'([^']+)'/gm)].map(
    ([, key, label]) => [label, key]
  )
);

const ICON_BY_CATEGORY = {
  Productivity: '🗂️',
  'Creative & Design': '🎨',
  'Media & Entertainment': '🎬',
  'Social & Messaging': '💬',
  'Developer Tools': '🛠️',
  Utilities: '🧰',
  'Games & Leisure': '🎮',
  'Shopping & Lifestyle': '🛍️',
  'News & Weather': '🗞️',
  Education: '🎓',
  'Business & Finance': '💼',
  'Health & Lifestyle': '🌿',
};

async function gh(path, init = {}) {
  if (DRY_RUN && init.method && init.method !== 'GET') {
    console.log(`  [dry-run] ${init.method} ${path} ${init.body ?? ''}`);
    return null;
  }
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${init.method ?? 'GET'} ${path}: HTTP ${res.status}`);
  return res.json();
}

async function loadQueue() {
  if (process.env.ISSUES_FILE) {
    return JSON.parse(await readFile(process.env.ISSUES_FILE, 'utf8'));
  }
  return gh(
    `/repos/${REPO}/issues?state=open&labels=${encodeURIComponent('app-submission,checks-passed')}&per_page=100&sort=created&direction=asc`
  );
}

// GitHub issue forms render each field as "### <label>\n\n<value>".
function parseSubmission(body) {
  const fields = {};
  for (const section of body.split(/^### /m).slice(1)) {
    const nl = section.indexOf('\n');
    const label = section.slice(0, nl).trim();
    const value = section.slice(nl + 1).trim();
    fields[label] = value === '_No response_' ? '' : value;
  }
  const capabilities = [...(fields['Capabilities (optional)'] ?? '').matchAll(/- \[[xX]\] (.+)/g)]
    .map(([, label]) => CAPABILITY_KEY_BY_LABEL[label.trim()])
    .filter(Boolean);
  return {
    name: fields['App name'] ?? '',
    url: (fields['App URL'] ?? '').split(/\s/)[0],
    category: fields['Category'] === 'Other' ? 'Utilities' : (fields['Category'] ?? ''),
    tagline: fields['One-line description'] ?? '',
    description: fields['Longer description (optional)'] ?? '',
    capabilities,
  };
}

// Heuristic: a landing page that registers a service worker (or declares one
// in a link tag) is treated as offline-capable.
async function detectOffline(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
      headers: { accept: 'text/html' },
    });
    if (!res.ok) return false;
    return /navigator\.serviceWorker|rel=["']?serviceworker/i.test(await res.text());
  } catch {
    return false;
  }
}

async function comment(issue, body) {
  await gh(`/repos/${REPO}/issues/${issue.number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

async function setOutcome(issue, published) {
  if (published) {
    await gh(`/repos/${REPO}/issues/${issue.number}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels: ['published'] }),
    });
    await gh(`/repos/${REPO}/issues/${issue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
    });
  } else {
    await gh(
      `/repos/${REPO}/issues/${issue.number}/labels/${encodeURIComponent('checks-passed')}`,
      { method: 'DELETE' }
    ).catch(() => {});
    await gh(`/repos/${REPO}/issues/${issue.number}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels: ['checks-failed'] }),
    });
  }
}

const queue = await loadQueue();
console.log(`Queue: ${queue.length} submission(s).\n`);

const added = [];
const rejected = [];

for (const issue of queue) {
  const sub = parseSubmission(issue.body ?? '');
  console.log(`#${issue.number} ${sub.name} — ${sub.url}`);
  if (!sub.url || !sub.name) {
    rejected.push({ issue, sub, reason: 'could not parse the app name or URL from the issue' });
    continue;
  }
  if (await detectOffline(sub.url)) {
    if (!sub.capabilities.includes('offline')) sub.capabilities.push('offline');
  }
  try {
    const { stdout } = await run('node', [new URL('curate.mjs', SCRIPTS_DIR).pathname], {
      timeout: 90000,
      env: {
        ...process.env,
        ACTION: 'add',
        APP: sub.url,
        NAME: sub.name,
        CATEGORY: sub.category,
        TAGLINE: sub.tagline,
        DESCRIPTION: sub.description,
        CAPABILITIES: sub.capabilities.join(','),
        ICON: ICON_BY_CATEGORY[sub.category] ?? '🌐',
      },
    });
    const slug = stdout.match(/\(`([^`]+)`\)/)?.[1] ?? '';
    added.push({ issue, sub, slug });
    console.log(`  ✔ added as ${slug}`);
  } catch (err) {
    const out = ((err.stdout ?? '') + (err.stderr ?? '')).trim();
    const reason = out.match(/Nothing changed\.\s*(.*)/)?.[1] ?? out.slice(-300);
    rejected.push({ issue, sub, reason });
    console.log(`  ✖ rejected: ${reason}`);
  }
}

for (const { issue, sub, slug } of added) {
  await comment(
    issue,
    `🎉 **${sub.name}** passed the final checks and is now live in the community directory: ${SITE}/apps/${slug}/\n\n` +
      `It's listed "at your own risk" (community submissions aren't publisher-verified). Thanks for contributing!`
  );
  await setOutcome(issue, true);
}
for (const { issue, reason } of rejected) {
  await comment(
    issue,
    `❌ This submission failed at publish time: ${reason}\n\n` +
      `If this is fixable, edit the issue (the checks re-run automatically) and it will rejoin the queue.`
  );
  await setOutcome(issue, false);
}

const today = new Date().toISOString().slice(0, 10);
const digest = [
  `## Daily publish — ${today}`,
  '',
  ...(added.length
    ? [`### Published (${added.length})`, ...added.map(
        ({ issue, sub, slug }) =>
          `- **[${sub.name}](${SITE}/apps/${slug}/)** (${sub.category}) — ${sub.tagline} · [#${issue.number}](${issue.html_url ?? ''})`
      )]
    : ['No apps published.']),
  ...(rejected.length
    ? ['', `### Rejected at publish time (${rejected.length})`, ...rejected.map(
        ({ issue, sub, reason }) => `- **${sub.name || `#${issue.number}`}** — ${reason} · [#${issue.number}](${issue.html_url ?? ''})`
      )]
    : []),
  '',
  '_Spot-check the published apps; remove a bad one with the "Curate catalog" workflow (action: remove)._',
].join('\n');

await writeFile('digest.md', digest + '\n');
await writeFile('new-slugs.txt', added.map((a) => a.slug).join(' ') + '\n');
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, digest + '\n');
}
console.log(`\n${added.length} published, ${rejected.length} rejected.`);
