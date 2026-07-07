#!/usr/bin/env node
/**
 * Interaction notifications for Web App Finder.
 *
 * Interactions = community votes (Supabase) + app submissions (GitHub issues).
 * Designed to run every 10 minutes from GitHub Actions:
 *   - Each new interaction in the last 10 minutes gets its own email, up to
 *     the first 10 interactions of the (UTC) hour.
 *   - On the first run of a new hour, interactions beyond the first 10 of the
 *     previous hour are sent as one summary email.
 *
 * Emails are written as RFC-822 files to notify-out/; the workflow sends them
 * over SMTP with curl. Ranking is computed from timestamps, so the script
 * needs no state between runs.
 *
 * Env: SUPABASE_SECRET_KEY (read votes), GITHUB_TOKEN (read issues),
 *      MAIL_USERNAME (From address).
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const SUPABASE_URL = 'https://wdsvkegabcuzsukmamte.supabase.co';
const REPO = 'kromans11-gmail/kromans11-gmail.github.io';
const TO = 'kromans.dev@gmail.com';
const FROM = process.env.MAIL_USERNAME ?? TO;
const KEY = process.env.SUPABASE_SECRET_KEY;
const GH = process.env.GITHUB_TOKEN;
const WINDOW_MS = 10 * 60 * 1000;
const HOURLY_CAP = 10;
const OUT = new URL('../notify-out/', import.meta.url);

if (!KEY) {
  console.log('SUPABASE_SECRET_KEY not set; nothing to do.');
  process.exit(0);
}

const apps = JSON.parse(await readFile(new URL('../src/data/apps.json', import.meta.url), 'utf8'));
const appName = new Map(apps.map((a) => [a.slug, a.name]));

const sbHeaders = { apikey: KEY, authorization: `Bearer ${KEY}` };

async function votesBetween(fromIso, toIso) {
  const q = `${SUPABASE_URL}/rest/v1/votes?select=app_slug,created_at,comment&created_at=gte.${fromIso}&created_at=lt.${toIso}&order=created_at.asc`;
  const res = await fetch(q, { headers: sbHeaders });
  if (!res.ok) throw new Error(`votes fetch: HTTP ${res.status}`);
  return (await res.json()).map((v) => ({
    type: 'vote',
    time: new Date(v.created_at),
    slug: v.app_slug,
    comment: v.comment ?? null,
  }));
}

async function submissionsBetween(from, to) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/issues?state=all&labels=app-submission&since=${from.toISOString()}&per_page=100`,
    {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'pwa-finder-notify',
        ...(GH ? { authorization: `Bearer ${GH}` } : {}),
      },
    }
  );
  if (!res.ok) throw new Error(`issues fetch: HTTP ${res.status}`);
  return (await res.json())
    .filter((i) => {
      const created = new Date(i.created_at);
      return created >= from && created < to;
    })
    .map((i) => ({
      type: 'submission',
      time: new Date(i.created_at),
      number: i.number,
      title: i.title,
      author: i.user?.login ?? 'unknown',
      link: i.html_url,
    }));
}

async function interactionsBetween(from, to) {
  const [votes, subs] = await Promise.all([
    votesBetween(from.toISOString(), to.toISOString()),
    submissionsBetween(from, to),
  ]);
  return [...votes, ...subs].sort((a, b) => a.time - b.time);
}

let voteTotals = new Map();
try {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/vote_counts?select=app_slug,votes`, {
    headers: sbHeaders,
  });
  voteTotals = new Map((await res.json()).map((r) => [r.app_slug, r.votes]));
} catch {}

const fmt = (d) => d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

function describe(i) {
  if (i.type === 'vote') {
    const name = appName.get(i.slug) ?? i.slug;
    const note = i.comment ? ` — “${i.comment.slice(0, 200)}”` : '';
    return `${fmt(i.time)} — 👍 vote for ${name} (total now: ${voteTotals.get(i.slug) ?? '?'})${note}`;
  }
  return `${fmt(i.time)} — 📥 app submission #${i.number} "${i.title}" by ${i.author} (${i.link})`;
}

function email(subject, body) {
  return [
    `From: Web App Finder <${FROM}>`,
    `To: ${TO}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
    '',
  ].join('\r\n');
}

await mkdir(OUT, { recursive: true });
const now = new Date();
const hourStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
const windowStart = new Date(Math.max(now.getTime() - WINDOW_MS, hourStart.getTime()));

let n = 0;
const save = async (subject, body) => {
  n += 1;
  await writeFile(new URL(`${String(n).padStart(3, '0')}.eml`, OUT), email(subject, body));
  console.log(`queued: ${subject}`);
};

// Individual emails: new interactions in this window, within the hour's first 10.
const hourSoFar = await interactionsBetween(hourStart, now);
for (const [idx, i] of hourSoFar.entries()) {
  if (i.time < windowStart || idx >= HOURLY_CAP) continue;
  if (i.type === 'vote') {
    const name = appName.get(i.slug) ?? i.slug;
    await save(
      `Web App Finder: new vote for ${name}`,
      [
        'A community member found an app useful.',
        '',
        `App: ${name} (${i.slug})`,
        `When: ${fmt(i.time)}`,
        ...(i.comment ? [`Comment: “${i.comment}”`] : []),
        `Total votes for this app: ${voteTotals.get(i.slug) ?? '?'}`,
        `Interaction #${idx + 1} this hour.`,
      ].join('\n')
    );
  } else {
    await save(
      `Web App Finder: new app submission — ${i.title}`,
      [
        'Someone submitted an app to the community directory.',
        '',
        `Title: ${i.title}`,
        `By: ${i.author}`,
        `When: ${fmt(i.time)}`,
        `Review it here: ${i.link}`,
        `Interaction #${idx + 1} this hour.`,
      ].join('\n')
    );
  }
}

// First run of a new hour: summarize the previous hour's overflow (11th onward).
if (now.getTime() - hourStart.getTime() < WINDOW_MS) {
  const prevStart = new Date(hourStart.getTime() - 3600_000);
  const prev = await interactionsBetween(prevStart, hourStart);
  if (prev.length > HOURLY_CAP) {
    const rest = prev.slice(HOURLY_CAP);
    await save(
      `Web App Finder: ${rest.length} more interaction(s) last hour`,
      [
        `The hour ${fmt(prevStart)}–${fmt(hourStart)} had ${prev.length} interactions.`,
        `The first ${HOURLY_CAP} were emailed individually; here are the rest:`,
        '',
        ...rest.map(describe),
      ].join('\n')
    );
  }
}

console.log(`${n} email(s) queued.`);
