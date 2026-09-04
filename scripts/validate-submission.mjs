#!/usr/bin/env node
/**
 * Validate a community app submission URL. Prints a markdown report for the
 * submission issue; exits non-zero if any hard check fails.
 *
 * Usage: node scripts/validate-submission.mjs <url>
 */
import net from 'node:net';

const raw = (process.argv[2] ?? '').trim();

const KNOWN_SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'is.gd',
  'buff.ly',
  'ow.ly',
  'rebrand.ly',
  'cutt.ly',
  'tiny.cc',
  'shorturl.at',
  'snip.ly',
  'bl.ink',
  'v.gd',
  'clck.ru',
  'trib.al',
  'qr.ae',
  'adf.ly',
  'linktr.ee',
  'shorte.st',
]);

const registrable = (h) => h.split('.').slice(-2).join('.');
const isIpAddress = (h) => net.isIP(h.replace(/^\[|\]$/g, '')) !== 0;
const isShortener = (h) =>
  KNOWN_SHORTENERS.has(registrable(h).toLowerCase()) ||
  KNOWN_SHORTENERS.has(h.toLowerCase());
const isLocalOrInternal = (h) => {
  const clean = h.toLowerCase();
  return (
    clean === 'localhost' ||
    clean.endsWith('.local') ||
    clean.endsWith('.internal') ||
    clean.endsWith('.test') ||
    clean.endsWith('.example') ||
    clean.endsWith('.invalid')
  );
};

const TRACKING_PARAMS = new Set([
  'ref',
  'aff',
  'affiliate',
  'ref_src',
  'referrer',
  'fbclid',
  'gclid',
  'msclkid',
  'mc_eid',
  'yclid',
  'campaign',
]);

const stripTrackingParams = (urlObj) => {
  const toDelete = [];
  for (const [k] of urlObj.searchParams) {
    const lower = k.toLowerCase();
    if (lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)) {
      toDelete.push(k);
    }
  }
  for (const k of toDelete) {
    urlObj.searchParams.delete(k);
  }
  return toDelete.length > 0;
};

const lines = ['## Automated submission check', ''];
let failed = false;
const pass = (msg) => lines.push(`- ✅ ${msg}`);
const warn = (msg) => lines.push(`- ⚠️ ${msg}`);
const fail = (msg) => {
  lines.push(`- ❌ ${msg}`);
  failed = true;
};

let url;
try {
  url = new URL(raw);
  if (url.protocol !== 'https:') {
    fail(`URL must start with https:// (got \`${url.protocol}//\`)`);
  } else if (url.username || url.password) {
    fail('URL must not contain embedded user credentials');
  } else if (isIpAddress(url.hostname)) {
    fail(`Submissions cannot use a raw IP address (\`${url.hostname}\`); please provide the official domain name`);
  } else if (isLocalOrInternal(url.hostname)) {
    fail(`Submissions must be publicly reachable internet addresses (got \`${url.hostname}\`)`);
  } else if (isShortener(url.hostname)) {
    fail(`URL shorteners and redirect services (\`${url.hostname}\`) are not accepted. Please provide the app's direct official domain.`);
  } else {
    const stripped = stripTrackingParams(url);
    if (stripped) {
      pass(`Cleaned URL: stripped affiliate/marketing tracking parameters -> \`${url.href}\``);
    } else {
      pass(`URL is well-formed and uses HTTPS: \`${url.href}\``);
    }
  }
} catch {
  fail(`Could not parse a URL from the submission (got \`${raw || 'nothing'}\`)`);
}

if (url && !failed) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (res.status === 403 || res.status === 429) {
      warn(`Site blocks automated checks (HTTP ${res.status}) — needs manual review`);
    } else if (!res.ok) {
      fail(`Site responded with HTTP ${res.status}`);
    } else {
      pass(`Site is reachable (HTTP ${res.status})`);
      const final = new URL(res.url);
      stripTrackingParams(final);
      if (final.protocol !== 'https:') fail('Final page is not served over HTTPS');
      if (isIpAddress(final.hostname)) fail(`Redirects to a raw IP address (\`${final.hostname}\`)`);
      if (isShortener(final.hostname)) fail(`Redirects to a URL shortening service (\`${final.hostname}\`)`);
      if (isLocalOrInternal(final.hostname)) fail(`Redirects to an internal/private address (\`${final.hostname}\`)`);
      if (registrable(final.hostname) !== registrable(url.hostname)) {
        fail(`Redirects off-domain to \`${final.origin}\``);
      } else {
        pass('Stays on its own domain');
      }
      const html = await res.text();
      if (/<link[^>]+rel=["']?manifest/i.test(html)) {
        pass('Web app manifest found — looks installable');
      } else {
        warn('No web app manifest tag found on the landing page — may not be installable; needs manual review');
      }
    }
  } catch (err) {
    fail(`Site is unreachable: \`${err.cause?.code ?? err.name}\``);
  }
}

lines.push('');
lines.push(
  failed
    ? '**Result: checks failed.** Please fix the issues above and edit the submission — the check will run again.'
    : '**Result: automated checks passed.** The curator will review this submission next; community listings appear with the "At your own risk" label.'
);
console.log(lines.join('\n'));
process.exitCode = failed ? 1 : 0;
