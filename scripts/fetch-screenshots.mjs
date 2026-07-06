#!/usr/bin/env node
/**
 * Pull screenshots declared in each listed app's web app manifest.
 *
 * For every app in src/data/apps.json: fetch the landing page, locate the
 * manifest link, fetch the manifest, and collect up to 4 valid HTTPS
 * screenshot URLs (each checked to actually serve an image). Results go to
 * src/data/screenshots.json (slug -> [{src, label}]), which detail pages
 * render as a screenshot strip. Images are hotlinked from the app's own
 * origin, not copied — re-run this script to refresh.
 *
 * Usage: npm run screenshots
 */
import { readFile, writeFile } from 'node:fs/promises';

const APPS_PATH = new URL('../src/data/apps.json', import.meta.url);
const OUT_PATH = new URL('../src/data/screenshots.json', import.meta.url);
const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
};
const MAX_PER_APP = 4;

async function imageOk(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const ok = res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
    await res.body?.cancel();
    return ok;
  } catch {
    return false;
  }
}

async function forApp(app) {
  try {
    const page = await fetch(app.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: { ...HEADERS, accept: 'text/html' },
    });
    if (!page.ok) return null;
    const html = await page.text();
    const tag = html.match(/<link[^>]+rel=["']?manifest["']?[^>]*>/i)?.[0];
    const href = tag?.match(/href=["']?([^"' >]+)/i)?.[1];
    if (!href) return null;

    const manifestUrl = new URL(href, page.url);
    const manifestRes = await fetch(manifestUrl, {
      signal: AbortSignal.timeout(10000),
      headers: HEADERS,
    });
    if (!manifestRes.ok) return null;
    const manifest = JSON.parse(await manifestRes.text());
    const declared = Array.isArray(manifest.screenshots) ? manifest.screenshots : [];

    const shots = [];
    for (const s of declared) {
      if (shots.length >= MAX_PER_APP || !s?.src) continue;
      let abs;
      try {
        abs = new URL(s.src, manifestUrl);
      } catch {
        continue;
      }
      if (abs.protocol !== 'https:') continue;
      if (await imageOk(abs.href)) {
        shots.push({ src: abs.href, ...(s.label ? { label: s.label } : {}) });
      }
    }
    return shots.length ? shots : null;
  } catch {
    return null;
  }
}

const apps = JSON.parse(await readFile(APPS_PATH, 'utf8'));
console.log(`Checking manifests of ${apps.length} apps for screenshots…`);

const out = {};
for (let i = 0; i < apps.length; i += 8) {
  const batch = apps.slice(i, i + 8);
  const results = await Promise.all(batch.map(forApp));
  batch.forEach((app, j) => {
    if (results[j]) {
      out[app.slug] = results[j];
      console.log(`  ✔ ${app.name}: ${results[j].length} screenshot(s)`);
    }
  });
  process.stdout.write(`…${Math.min(i + 8, apps.length)}/${apps.length}\r`);
}

const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(OUT_PATH, JSON.stringify(sorted, null, 2) + '\n');
console.log(`\n${Object.keys(sorted).length} apps have manifest screenshots → src/data/screenshots.json`);
