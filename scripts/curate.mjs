#!/usr/bin/env node
/**
 * Curator actions for the Web App Finder catalog, driven by the "Curate catalog"
 * GitHub Actions form (.github/workflows/curate.yml). Only the repo owner can
 * run that form, which is what makes this a personal tool.
 *
 * Env:
 *   ACTION         add | remove | verify | unverify | set-score |
 *                  spotlight-on | spotlight-off
 *   APP            web address (add) or app name/slug/domain (everything else)
 *   NAME           optional display name (add)
 *   CATEGORY       optional category (add); defaults to Utilities
 *   TAGLINE        optional one-line tagline (add)
 *   DESCRIPTION    optional longer description (add); falls back to the
 *                  manifest description, then the tagline
 *   CAPABILITIES   optional comma-separated capability keys (add); must be
 *                  keys defined in src/data/capabilities.ts
 *   ICON           optional emoji icon (add); defaults to 🌐
 *   SCORE          popularity 0-100 (set-score; optional starting score for add)
 *   MARK_VERIFIED  yes | no (add); default no
 *
 * The script edits src/data/apps.json; the workflow commits and redeploys.
 * All human-readable results go to the run's summary page.
 */
import { readFile, writeFile, appendFile } from 'node:fs/promises';

const APPS_PATH = new URL('../src/data/apps.json', import.meta.url);
const CAPABILITIES_PATH = new URL('../src/data/capabilities.ts', import.meta.url);

// Capability keys are defined once, in src/data/capabilities.ts.
async function knownCapabilities() {
  const src = await readFile(CAPABILITIES_PATH, 'utf8');
  return [...src.matchAll(/^\s*'?([a-z-]+)'?:\s*'/gm)].map((m) => m[1]);
}

const CATEGORIES = [
  'Productivity',
  'Creative & Design',
  'Media & Entertainment',
  'Social & Messaging',
  'Developer Tools',
  'Utilities',
  'Games & Leisure',
  'Shopping & Lifestyle',
  'News & Weather',
  'Education',
  'Business & Finance',
  'Health & Lifestyle',
];

const env = (k) => (process.env[k] ?? '').trim();
const today = () => new Date().toISOString().slice(0, 10);

const lines = [];
const say = (s) => {
  lines.push(s);
  console.log(s.replace(/\*\*/g, ''));
};
async function finish(code) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }
  process.exit(code);
}
async function fail(msg) {
  say(`❌ **Nothing changed.** ${msg}`);
  await finish(1);
}

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const registrableDomain = (host) => host.split('.').slice(-2).join('.');

async function checkUrl(url) {
  const result = { failures: [], warnings: [], manifestHref: null, finalUrl: null };
  let res;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
      headers: {
        'user-agent':
          'Mozilla/5.0 (compatible; PWA-Finder-check/1.0; +https://pwafinder.example)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
  } catch (err) {
    const code = err.cause?.code ?? err.name ?? err.message;
    if (code === 'UND_ERR_HEADERS_OVERFLOW') {
      result.warnings.push('response too large for automated check — verify manually');
    } else if (err.message === 'fetch failed' && /redirect count exceeded/.test(err.cause?.message ?? '')) {
      result.warnings.push('redirect loop for automated clients (bot protection) — verify manually');
    } else {
      result.failures.push(`unreachable: ${code}`);
    }
    return result;
  }

  result.finalUrl = res.url;
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    result.warnings.push(`blocked automated check (HTTP ${res.status}) — verify manually`);
    return result;
  }
  if (!res.ok) {
    result.failures.push(`HTTP ${res.status}`);
    return result;
  }
  const finalUrl = new URL(res.url);
  if (finalUrl.protocol !== 'https:') {
    result.failures.push(`served over ${finalUrl.protocol.replace(':', '')}, not HTTPS`);
  }
  if (registrableDomain(finalUrl.hostname) !== registrableDomain(new URL(url).hostname)) {
    result.failures.push(`redirects off-domain to ${finalUrl.origin}`);
  }
  try {
    const html = await res.text();
    const m = html.match(/<link[^>]+rel=["']?manifest["']?[^>]*>/i);
    if (m) {
      const href = m[0].match(/href=["']?([^"' >]+)/i);
      if (href) result.manifestHref = new URL(href[1], res.url).href;
      else result.manifestHref = '';
    }
  } catch {
    result.warnings.push('could not read page body');
  }
  return result;
}

const apps = JSON.parse(await readFile(APPS_PATH, 'utf8'));

function findApp(query) {
  const q = query.toLowerCase();
  let hits = apps.filter((a) => a.slug === q || a.name.toLowerCase() === q);
  if (hits.length === 0 && q.includes('.')) {
    const domain = q.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    hits = apps.filter(
      (a) => new URL(a.url).hostname.replace(/^www\./, '') === domain
    );
  }
  if (hits.length === 0) {
    hits = apps.filter((a) => a.name.toLowerCase().includes(q) || a.slug.includes(slugify(q)));
  }
  return hits;
}

async function resolveApp(query) {
  if (!query) await fail('The **app** field is required for this action.');
  const hits = findApp(query);
  if (hits.length === 1) return hits[0];
  if (hits.length === 0) {
    await fail(`No app in the catalog matches “${query}”. Try its exact name, slug, or web address.`);
  }
  await fail(
    `“${query}” matches ${hits.length} apps: ${hits.map((a) => `\`${a.slug}\``).join(', ')}. Use one of those slugs.`
  );
}

function parseScore(required) {
  const raw = env('SCORE');
  if (!raw) return required ? null : undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n);
}

const action = env('ACTION');
say(`## Curate: ${action}`);

switch (action) {
  case 'add': {
    let url = env('APP');
    if (!url) await fail('The **app** field must be the web address to add.');
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
      new URL(url);
    } catch {
      await fail(`“${url}” is not a valid web address.`);
    }
    const domain = new URL(url).hostname.replace(/^www\./, '');
    const dup = apps.find(
      (a) => new URL(a.url).hostname.replace(/^www\./, '') === domain
    );
    if (dup) await fail(`That domain is already listed as **${dup.name}** (\`${dup.slug}\`).`);

    const check = await checkUrl(url);
    if (check.failures.length) {
      await fail(`The address failed the listing check: ${check.failures.join('; ')}`);
    }
    if (check.manifestHref === null) {
      await fail(
        'The page has **no web app manifest**, so it is not installable as an app. ' +
          'If the app lives one level deeper (for example app.example.com), give that address instead.'
      );
    }
    let manifest = {};
    if (check.manifestHref) {
      try {
        manifest = await (await fetch(check.manifestHref, { signal: AbortSignal.timeout(15000) })).json();
      } catch {}
    }
    const name = env('NAME') || manifest.name || manifest.short_name || domain;
    const slug = slugify(name);
    if (apps.some((a) => a.slug === slug)) {
      await fail(`An app with the slug \`${slug}\` already exists. Give a different display name.`);
    }
    const category = env('CATEGORY') || 'Utilities';
    if (!CATEGORIES.includes(category)) {
      await fail(`Unknown category “${category}”. Choose one of: ${CATEGORIES.join(', ')}.`);
    }
    const tagline =
      env('TAGLINE') || manifest.description || `Installable web app at ${domain}.`;
    const score = parseScore(false);
    if (score === null) await fail('**score** must be a number from 0 to 100.');
    const known = await knownCapabilities();
    const capabilities = env('CAPABILITIES')
      ? env('CAPABILITIES').split(',').map((c) => c.trim()).filter(Boolean)
      : [];
    const unknown = capabilities.filter((c) => !known.includes(c));
    if (unknown.length) {
      await fail(
        `Unknown capabilities: ${unknown.join(', ')}. Choose from: ${known.join(', ')}.`
      );
    }
    apps.push({
      slug,
      name,
      url,
      category,
      tagline,
      description: env('DESCRIPTION') || manifest.description || tagline,
      popularity: score ?? 40,
      capabilities,
      icon: env('ICON') || '🌐',
      spotlight: false,
      verified: env('MARK_VERIFIED') === 'yes',
      lastChecked: today(),
      addedAt: today(), // drives the "New apps" shelf (first week after listing)
    });
    say(`✅ Added **${name}** (\`${slug}\`) to **${category}**, score ${score ?? 40}, ` +
        (env('MARK_VERIFIED') === 'yes' ? 'verified.' : 'at your own risk.'));
    for (const w of check.warnings) say(`⚠️ ${w}`);
    break;
  }

  case 'remove': {
    const app = await resolveApp(env('APP'));
    apps.splice(apps.indexOf(app), 1);
    say(`✅ Removed **${app.name}** (\`${app.slug}\`) from the catalog.`);
    break;
  }

  case 'verify': {
    const app = await resolveApp(env('APP'));
    const check = await checkUrl(app.url);
    if (check.failures.length) {
      await fail(
        `**${app.name}** failed the listing check, so the badge was not granted: ${check.failures.join('; ')}`
      );
    }
    app.verified = true;
    app.lastChecked = today();
    say(`✅ **${app.name}** passed the check and now carries the verified badge.`);
    for (const w of check.warnings) say(`⚠️ ${w}`);
    break;
  }

  case 'unverify': {
    const app = await resolveApp(env('APP'));
    app.verified = false;
    say(`✅ **${app.name}** is now listed “at your own risk”.`);
    break;
  }

  case 'set-score': {
    const app = await resolveApp(env('APP'));
    const score = parseScore(true);
    if (score === null) await fail('**score** must be a number from 0 to 100.');
    say(`✅ **${app.name}**: popularity ${app.popularity} → ${score}.`);
    app.popularity = score;
    break;
  }

  case 'spotlight-on':
  case 'spotlight-off': {
    const app = await resolveApp(env('APP'));
    app.spotlight = action === 'spotlight-on';
    say(
      app.spotlight
        ? `✅ **${app.name}** joins the Featured/Highly Useful daily rotation.`
        : `✅ **${app.name}** left the Featured/Highly Useful rotation (still listed in ${app.category}).`
    );
    break;
  }

  default:
    await fail(`Unknown action “${action}”.`);
}

await writeFile(APPS_PATH, JSON.stringify(apps, null, 2) + '\n');
say(`\nCatalog now holds ${apps.length} apps (${apps.filter((a) => a.verified).length} verified).`);
await finish(0);
