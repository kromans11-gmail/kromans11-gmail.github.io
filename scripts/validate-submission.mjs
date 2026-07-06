#!/usr/bin/env node
/**
 * Validate a community app submission URL. Prints a markdown report for the
 * submission issue; exits non-zero if any hard check fails.
 *
 * Usage: node scripts/validate-submission.mjs <url>
 */
const raw = (process.argv[2] ?? '').trim();

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
  if (url.protocol !== 'https:') fail(`URL must start with https:// (got \`${url.protocol}//\`)`);
  else pass(`URL is well-formed and uses HTTPS: \`${url.href}\``);
} catch {
  fail(`Could not parse a URL from the submission (got \`${raw || 'nothing'}\`)`);
}

if (url && !failed) {
  const registrable = (h) => h.split('.').slice(-2).join('.');
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
      if (final.protocol !== 'https:') fail('Final page is not served over HTTPS');
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
