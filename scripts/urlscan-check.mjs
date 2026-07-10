#!/usr/bin/env node
/**
 * urlscan.io reputation check for catalog listings.
 *
 * Two modes:
 *   node scripts/urlscan-check.mjs --all      check every app in apps.json
 *   node scripts/urlscan-check.mjs <url>      check one URL (submission flow)
 *
 * With URLSCAN_API_KEY set, each URL is submitted for a fresh scan
 * (visibility from URLSCAN_VISIBILITY, default "unlisted") and the verdict is
 * read from the finished result. Without a key, the public corpus is searched
 * for the most recent existing scan of the page's domain — free, but only
 * covers sites someone already scanned.
 *
 * Verdicts are advisory: "malicious" means urlscan's engines matched known
 * phishing/malware signals. A clean result is NOT proof of safety.
 *
 * Output: urlscan-report.md in the working directory; exit 1 if any URL got
 * a malicious verdict, else 0.
 */
import { readFile, writeFile } from 'node:fs/promises';

const APPS_PATH = new URL('../src/data/apps.json', import.meta.url);
const KEY = process.env.URLSCAN_API_KEY ?? '';
const VISIBILITY = process.env.URLSCAN_VISIBILITY || 'unlisted';
const API = 'https://urlscan.io/api/v1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every request goes through here: paced, with backoff on 429.
let last = 0;
async function api(path, init = {}, pace = 2000) {
  const wait = last + pace - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(KEY ? { 'api-key': KEY } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? 0) || 30 * (attempt + 1);
      console.log(`  rate limited; waiting ${retry}s…`);
      await sleep(retry * 1000);
      continue;
    }
    return res;
  }
  throw new Error(`urlscan: still rate limited after retries (${path})`);
}

async function resultVerdict(uuid) {
  const res = await api(`/result/${uuid}/`, {}, 1500);
  if (!res.ok) return null;
  const data = await res.json();
  return {
    malicious: data.verdicts?.overall?.malicious ?? false,
    score: data.verdicts?.overall?.score ?? 0,
    categories: data.verdicts?.overall?.categories ?? [],
    scannedAt: data.task?.time ?? '',
    report: `https://urlscan.io/result/${uuid}/`,
  };
}

// Fresh scan (needs API key): submit, then poll until the result exists.
async function freshScan(url) {
  const res = await api('/scan/', {
    method: 'POST',
    body: JSON.stringify({ url, visibility: VISIBILITY }),
  });
  if (res.status === 400) {
    const msg = (await res.json()).message ?? 'rejected';
    return { error: `submission rejected: ${msg}` };
  }
  if (!res.ok) return { error: `submission failed: HTTP ${res.status}` };
  const { uuid } = await res.json();
  for (let i = 0; i < 12; i++) {
    await sleep(10000);
    const verdict = await resultVerdict(uuid);
    if (verdict) return verdict;
  }
  return { error: 'scan did not finish in time' };
}

// No key: newest existing public scan of this page domain, if any.
async function existingScan(url) {
  const domain = new URL(url).hostname.replace(/^www\./, '');
  const res = await api(
    `/search/?q=${encodeURIComponent(`page.domain:${domain}`)}&size=1`,
    {},
    1500
  );
  if (!res.ok) return { error: `search failed: HTTP ${res.status}` };
  const hit = (await res.json()).results?.[0];
  if (!hit) return { error: 'never scanned (no public scan of this domain exists)' };
  const verdict = await resultVerdict(hit.task.uuid);
  return verdict ?? { error: 'could not read scan result' };
}

const targets = [];
if (process.argv[2] === '--all') {
  const apps = JSON.parse(await readFile(APPS_PATH, 'utf8'));
  targets.push(...apps.map((a) => ({ name: a.name, url: a.url })));
} else if (process.argv[2]) {
  targets.push({ name: process.argv[2], url: process.argv[2] });
} else {
  console.error('Usage: urlscan-check.mjs --all | <url>');
  process.exit(2);
}

console.log(
  `urlscan ${KEY ? `fresh scans (${VISIBILITY})` : 'existing public scans only (no URLSCAN_API_KEY)'} — ${targets.length} URL(s)\n`
);

const malicious = [];
const clean = [];
const unknown = [];
for (const t of targets) {
  const v = await (KEY ? freshScan(t.url) : existingScan(t.url));
  if (v.error) {
    unknown.push({ ...t, note: v.error });
    console.log(`?  ${t.name}: ${v.error}`);
  } else if (v.malicious) {
    malicious.push({ ...t, ...v });
    console.log(`✖  ${t.name}: MALICIOUS verdict (score ${v.score}) ${v.report}`);
  } else {
    clean.push({ ...t, ...v });
    console.log(`✔  ${t.name}: no malicious verdict (scanned ${v.scannedAt.slice(0, 10)})`);
  }
}

const lines = [
  `## urlscan.io check — ${new Date().toISOString().slice(0, 10)}`,
  '',
  `Mode: ${KEY ? `fresh ${VISIBILITY} scans` : 'existing public scans (no API key)'} · ${targets.length} URL(s): ${malicious.length} malicious, ${clean.length} clean, ${unknown.length} unknown.`,
  '',
  ...(malicious.length
    ? [
        '### ⚠️ Malicious verdicts — review on your safe machine',
        ...malicious.map((m) => `- **${m.name}** (${m.url}) — score ${m.score}, ${m.categories.join(', ') || 'uncategorized'} — [report](${m.report})`),
        '',
      ]
    : []),
  ...(unknown.length
    ? ['### Not scanned / no data', ...unknown.map((u) => `- ${u.name} (${u.url}) — ${u.note}`), '']
    : []),
  '_A clean urlscan verdict is advisory, not proof of safety._',
];
await writeFile('urlscan-report.md', lines.join('\n') + '\n');
console.log(
  `\n${malicious.length} malicious, ${clean.length} clean, ${unknown.length} unknown → urlscan-report.md`
);
process.exitCode = malicious.length ? 1 : 0;
