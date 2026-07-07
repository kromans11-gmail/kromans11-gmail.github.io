#!/usr/bin/env node
/**
 * Manifest audit: verifies every catalog listing is actually installable.
 *
 * For each app, in order:
 *   1. Plain fetch of the listed URL — look for a <link rel=manifest> whose
 *      target downloads and parses as JSON.
 *   2. Headless-Chrome render of the same URL — catches manifests injected
 *      by JavaScript.
 *   3. Candidate deeper entry points — a hand-kept map of known app screens
 *      plus app.<domain> / web.<domain> guesses (static check, then render
 *      for the known-map candidate).
 *
 * Verdicts: ok (manifest at listed URL), relink:<url> (manifest at a deeper
 * URL), login-walled (app hidden behind sign-in; kept), blocked (bot
 * defense; judged manually), dead (unreachable), none (no manifest
 * anywhere — not installable).
 *
 * Usage:
 *   node scripts/audit-manifests.mjs            report to audit-report.json
 *   node scripts/audit-manifests.mjs --apply    also rewrite apps.json:
 *                                               relink 'relink', drop 'none'
 *                                               (blocked/dead are kept)
 */
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const APPS_PATH = new URL('../src/data/apps.json', import.meta.url);
const REPORT_PATH = new URL('../audit-report.json', import.meta.url);
const APPLY = process.argv.includes('--apply');
const CHROME = process.env.CHROME_BIN ?? 'google-chrome-stable';
const UA =
  'Mozilla/5.0 (compatible; PWA-Finder-check/1.0; +https://pwafinder.example)';

// Known real app screens for listings whose front page is only a brochure.
const KNOWN_ENTRY = {
  notesnook: 'https://app.notesnook.com',
  penpot: 'https://design.penpot.app',
  grist: 'https://docs.getgrist.com',
  nocodb: 'https://app.nocodb.com',
  affine: 'https://app.affine.pro',
  n8n: 'https://app.n8n.cloud',
  'invoice-ninja': 'https://app.invoiceninja.com',
  pixelfed: 'https://pixelfed.social',
  descript: 'https://web.descript.com',
  padloc: 'https://web.padloc.app',
  docuseal: 'https://console.docuseal.com',
  felt: 'https://app.felt.com',
  cryptpad: 'https://cryptpad.fr/drive/',
};

const registrable = (h) => h.split('.').slice(-2).join('.');

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    });
    if ([401, 403, 406, 429].includes(res.status)) return { blocked: true };
    if (!res.ok) return { dead: `HTTP ${res.status}` };
    return { html: await res.text(), finalUrl: res.url };
  } catch (err) {
    const code = err.cause?.code ?? err.name ?? err.message;
    if (
      code === 'UND_ERR_HEADERS_OVERFLOW' ||
      /redirect count exceeded/.test(err.cause?.message ?? '')
    ) {
      return { blocked: true };
    }
    return { dead: `unreachable: ${code}` };
  }
}

function manifestHrefIn(html, baseUrl) {
  const tag = html?.match(/<link[^>]+rel=["']?manifest["']?[^>]*>/i)?.[0];
  const href = tag?.match(/href=["']?([^"' >]+)/i)?.[1];
  if (!href) return null;
  try {
    return new URL(href.replaceAll('&amp;', '&'), baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * A linked manifest counts as present unless its URL is definitively gone
 * (404/410). Many SPA servers answer manifest.json fetches from non-browser
 * clients with the HTML shell, and some gate it behind cookies — a JSON
 * requirement here would fail real PWAs (app.notesnook.com does exactly this).
 */
async function manifestPresent(href) {
  try {
    const res = await fetch(href, {
      signal: AbortSignal.timeout(15000),
      headers: { 'user-agent': UA },
    });
    return res.status !== 404 && res.status !== 410;
  } catch {
    return true; // network hiccup — trust the tag
  }
}

/**
 * Last resort before a 'none' verdict: some apps serve a manifest at the
 * conventional paths without linking it on the logged-out page (YouTube
 * Music). Unlike the link-tag check, this must insist on real JSON — SPA
 * servers answer *every* path with the HTML shell.
 */
async function probedManifest(baseUrl) {
  const origin = new URL(baseUrl).origin;
  for (const path of ['/manifest.webmanifest', '/manifest.json']) {
    try {
      const res = await fetch(origin + path, {
        signal: AbortSignal.timeout(15000),
        headers: { 'user-agent': UA },
      });
      if (!res.ok) continue;
      const json = JSON.parse(await res.text());
      if (json && typeof json === 'object' && (json.name || json.short_name || json.icons)) return true;
    } catch {}
  }
  return false;
}

/** Sign-in redirects hide the app (and its manifest) from us entirely. */
function looksLoginWalled(finalUrl) {
  const u = new URL(finalUrl);
  if (
    ['accounts.google.com', 'login.live.com', 'login.microsoftonline.com', 'appleid.apple.com'].includes(u.hostname) ||
    u.hostname.startsWith('auth.') ||
    u.hostname.startsWith('login.')
  ) {
    return true;
  }
  return /(^|\/)(login|signin|sign-in|signup|auth)(\/|$|\?)/i.test(u.pathname) || /[?&](login|signin)/i.test(u.search);
}

async function staticManifest(url) {
  const page = await fetchHtml(url);
  if (page.blocked || page.dead) return page;
  const href = manifestHrefIn(page.html, page.finalUrl);
  return { hasManifest: Boolean(href && (await manifestPresent(href))), html: page.html, finalUrl: page.finalUrl };
}

async function renderedManifest(url) {
  const profile = await mkdtemp(join(tmpdir(), 'audit-chrome-'));
  try {
    const { stdout: dom } = await exec(
      CHROME,
      [
        '--headless',
        '--disable-gpu',
        '--no-first-run',
        `--user-data-dir=${profile}`,
        '--virtual-time-budget=9000',
        '--timeout=30000',
        '--dump-dom',
        url,
      ],
      { timeout: 60000, maxBuffer: 64 * 1024 * 1024 }
    );
    const href = manifestHrefIn(dom, url);
    return Boolean(href && (await manifestPresent(href)));
  } catch {
    return false;
  } finally {
    // Chrome may still be flushing profile files; a failed cleanup is harmless.
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

async function auditApp(app) {
  const first = await staticManifest(app.url);
  if (first.blocked) return { slug: app.slug, verdict: 'blocked' };
  if (first.dead) return { slug: app.slug, verdict: 'dead', detail: first.dead };
  if (first.hasManifest) return { slug: app.slug, verdict: 'ok' };
  if (looksLoginWalled(first.finalUrl)) {
    // The app (and its manifest) sit behind sign-in; nothing to judge here.
    return { slug: app.slug, verdict: 'login-walled' };
  }

  if (await renderedManifest(app.url)) return { slug: app.slug, verdict: 'ok', detail: 'rendered' };

  // Candidate deeper entry points. A candidate only counts if it answers on
  // its own host — bouncing elsewhere (app.youtube.com → www.youtube.com)
  // proves nothing about the candidate address.
  const host = new URL(app.url).hostname;
  const domain = registrable(host);
  const candidates = [];
  if (KNOWN_ENTRY[app.slug]) candidates.push(KNOWN_ENTRY[app.slug]);
  for (const sub of ['app', 'web']) {
    const guess = `https://${sub}.${domain}`;
    if (new URL(guess).hostname !== host) candidates.push(guess);
  }
  for (const cand of candidates) {
    const res = await staticManifest(cand);
    if (!res.finalUrl || new URL(res.finalUrl).hostname !== new URL(cand).hostname) continue;
    if (res.hasManifest) return { slug: app.slug, verdict: 'relink', to: cand };
    if (looksLoginWalled(res.finalUrl)) return { slug: app.slug, verdict: 'login-walled', detail: cand };
  }
  // Render only the hand-picked candidate; the guesses aren't worth 2×Chrome.
  if (KNOWN_ENTRY[app.slug] && (await renderedManifest(KNOWN_ENTRY[app.slug]))) {
    return { slug: app.slug, verdict: 'relink', to: KNOWN_ENTRY[app.slug], detail: 'rendered' };
  }
  if (await probedManifest(first.finalUrl ?? app.url)) {
    return { slug: app.slug, verdict: 'ok', detail: 'probed' };
  }
  return { slug: app.slug, verdict: 'none' };
}

const apps = JSON.parse(await readFile(APPS_PATH, 'utf8'));
console.log(`Auditing ${apps.length} listings for installability…`);

const results = [];
const CONCURRENCY = 4;
for (let i = 0; i < apps.length; i += CONCURRENCY) {
  const batch = apps.slice(i, i + CONCURRENCY);
  results.push(...(await Promise.all(batch.map(auditApp))));
  process.stdout.write(`  ${results.length}/${apps.length}\r`);
}
console.log('');

const byVerdict = {};
for (const r of results) (byVerdict[r.verdict] ??= []).push(r);
for (const [verdict, list] of Object.entries(byVerdict)) {
  console.log(`\n${verdict.toUpperCase()} (${list.length}):`);
  for (const r of list) {
    if (verdict === 'ok') continue; // too many to print
    console.log(`  ${r.slug}${r.to ? ' -> ' + r.to : ''}${r.detail ? ' (' + r.detail + ')' : ''}`);
  }
}
console.log(`OK not listed individually: ${byVerdict.ok?.length ?? 0} apps.`);

await writeFile(REPORT_PATH, JSON.stringify(results, null, 2) + '\n');
console.log(`\nFull report: audit-report.json`);

if (APPLY) {
  const verdictOf = new Map(results.map((r) => [r.slug, r]));
  const today = new Date().toISOString().slice(0, 10);
  const kept = [];
  for (const app of apps) {
    const r = verdictOf.get(app.slug);
    if (r.verdict === 'none') continue; // not installable anywhere — drop
    if (r.verdict === 'relink') {
      app.url = r.to;
      app.lastChecked = today;
    }
    kept.push(app);
  }
  await writeFile(APPS_PATH, JSON.stringify(kept, null, 2) + '\n');
  console.log(
    `Applied: ${byVerdict.relink?.length ?? 0} relinked, ${byVerdict.none?.length ?? 0} removed, ` +
      `${kept.length} apps remain. Rebuild and deploy to publish.`
  );
}
