#!/usr/bin/env node
/**
 * Monthly verification re-check for catalog listings.
 *
 * For each app in src/data/apps.json it verifies:
 *   1. The URL responds over HTTPS (valid certificate, status < 400).
 *   2. Redirects stay on the same registrable domain (catches sold or
 *      hijacked domains pointing somewhere else).
 *   3. The page still references a web app manifest (warning only).
 *
 * Hard failures: unreachable, HTTP error status, downgrade to http://,
 * redirect to a different domain.
 * Warnings (never revoke automatically): bot-blocking responses (401/403/429
 * or redirect loops aimed at automated clients), missing manifest tag.
 *
 * Usage:
 *   npm run check            report only
 *   npm run check -- --apply also stamp lastChecked and set verified:false
 *                            on hard failures (re-granting verified is a
 *                            manual decision — the script never sets true)
 */
import { readFile, writeFile } from 'node:fs/promises';

const APPS_PATH = new URL('../src/data/apps.json', import.meta.url);
const APPLY = process.argv.includes('--apply');
const TIMEOUT_MS = 20000;
const CONCURRENCY = 5;

const registrableDomain = (host) => host.split('.').slice(-2).join('.');

async function checkApp(app) {
  const result = { app, failures: [], warnings: [] };
  let res;
  try {
    res = await fetch(app.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent':
          'Mozilla/5.0 (compatible; PWA-Finder-check/1.0; +https://pwafinder.example)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
  } catch (err) {
    const code = err.cause?.code ?? err.name ?? err.message;
    // The server responded but exceeded our HTTP client's limits — that's
    // not a dead or hijacked site, so don't revoke over it.
    if (code === 'UND_ERR_HEADERS_OVERFLOW') {
      result.warnings.push('response too large for automated check — verify manually');
    } else if (err.message === 'fetch failed' && /redirect count exceeded/.test(err.cause?.message ?? '')) {
      // Endless redirects for non-browser clients (e.g. xe.com) — bot
      // defense, not a dead site.
      result.warnings.push('redirect loop for automated clients (bot protection) — verify manually');
    } else {
      result.failures.push(`unreachable: ${code}`);
    }
    return result;
  }

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
  if (registrableDomain(finalUrl.hostname) !== registrableDomain(new URL(app.url).hostname)) {
    result.failures.push(`redirects off-domain to ${finalUrl.origin}`);
  }

  try {
    const html = await res.text();
    if (!/<link[^>]+rel=["']?manifest/i.test(html)) {
      result.warnings.push('no web app manifest tag found on landing page');
    }
  } catch {
    result.warnings.push('could not read page body');
  }

  return result;
}

const apps = JSON.parse(await readFile(APPS_PATH, 'utf8'));
console.log(`Checking ${apps.length} listings…\n`);

const results = [];
for (let i = 0; i < apps.length; i += CONCURRENCY) {
  const batch = apps.slice(i, i + CONCURRENCY);
  results.push(...(await Promise.all(batch.map(checkApp))));
}

// Unverified listings already carry the at-your-own-risk badge; their
// failures are informational and must not trip the monthly alarm.
let failed = 0;
for (const result of results) {
  if (!result.app.verified) {
    result.warnings.unshift(...result.failures.splice(0));
  }
}
for (const { app, failures, warnings } of results) {
  const status = failures.length ? '✖ FAIL' : warnings.length ? '⚠ WARN' : '✔ OK  ';
  const tag = app.verified ? '' : ' (unverified — informational)';
  console.log(`${status}  ${app.name.padEnd(22)} ${app.url}${tag}`);
  for (const f of failures) console.log(`         └─ ${f}`);
  for (const w of warnings) console.log(`         └─ ${w}`);
  if (failures.length) failed++;
}

const today = new Date().toISOString().slice(0, 10);
if (APPLY) {
  for (const { app, failures } of results) {
    app.lastChecked = today;
    if (failures.length && app.verified) {
      app.verified = false;
      console.log(`\nRevoked verified badge: ${app.name}`);
    }
  }
  await writeFile(APPS_PATH, JSON.stringify(apps, null, 2) + '\n');
  console.log(`\nWrote lastChecked=${today} to apps.json${failed ? ' and revoked failing badges' : ''}.`);
  console.log('Rebuild the site (npm run build) to publish the changes.');
} else {
  console.log(`\n${results.length - failed} passed, ${failed} hard failures. Run with --apply to stamp lastChecked and revoke badges on failures.`);
}

process.exitCode = failed ? 1 : 0;
