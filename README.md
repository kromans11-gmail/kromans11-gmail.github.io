# Web App Finder

A curated, ranked directory of the best web apps — itself built as a PWA. Installable PWAs are highlighted; non-PWA web apps are accepted too, as long as they are fully useful in the browser without installation (tagged 🌐 Non-PWA, added by the curator via `non_pwa: yes` on the Curate workflow — the automated submission pipeline still requires a manifest).

- **Astro static site** — every app gets a real, crawlable URL for SEO.
- **Popularity-ranked categories** — apps sorted by a transparent 0–100 score.
- **Capability badges** — "Works offline", "No account required", etc.
- **Installable + offline** — web app manifest, service worker with network-first pages and stale-while-revalidate assets, offline fallback page.
- **Per-platform install instructions** — detail pages show the right steps for desktop, Android, or iOS.

## Commands

| Command           | Action                                       |
| :---------------- | :------------------------------------------- |
| `npm install`     | Install dependencies                         |
| `npm run dev`     | Start dev server at `localhost:4321`         |
| `npm run build`   | Build the production site to `./dist/`       |
| `npm run preview` | Preview the production build locally         |
| `npm run check`   | Re-check all listings (weekly verification)  |
| `npm run screenshots` | Refresh screenshots from app manifests   |

Note: the service worker lives in `public/sw.js` and only registers meaningfully against the production build (`npm run build && npm run preview`), not the dev server.

## Adding an app

Add an entry to `src/data/apps.json`:

```json
{
  "slug": "my-app",
  "name": "My App",
  "url": "https://example.com",
  "category": "Productivity",
  "tagline": "One-line summary shown on cards.",
  "description": "Longer description shown on the detail page.",
  "popularity": 75,
  "capabilities": ["offline", "no-account"],
  "icon": "🚀",
  "spotlight": true,
  "verified": true
}
```

The `/add/` page is a curator tool: fill in the form and it generates this JSON for you to paste.

`verified: true` shows a green "✔ Verified" badge linking to `/verification/`, which documents the checks (official canonical URL, cross-referenced authoritative sources, monthly re-checks). Unverified apps show an amber "⚠ At your own risk" badge instead, pointing to the planned community-contributed sister site (set its URL in `src/pages/verification.astro`). `verified: "unverifiable"` is a third state for apps fully hidden behind a sign-in page (e.g. Gmail) — they get a gray "🔒 Unverifiable" badge.

Capability keys are defined in `src/data/capabilities.ts`. Popularity is a 0–100 score, editorially seeded in v1.

Apps with `"spotlight": true` join the rotation pool: each day 3 of them appear under ✨ Featured and the rest under ⭐ Highly Useful, and the window shifts daily (computed from the visitor's date, so no rebuild is needed).

## Community submissions (automated daily publish)

Anyone can submit an app through the GitHub issue form (`.github/ISSUE_TEMPLATE/submit-app.yml`, linked from `/community/`). The pipeline is fully automated:

1. **On submission (or edit)** — `validate-submission.yml` checks the URL (HTTPS, reachable, stays on its domain, has a web app manifest), posts the report on the issue, and labels it `checks-passed` or `checks-failed`. Passing issues are the publish queue.
2. **Daily at 09:00 UTC** — `daily-publish.yml` runs `scripts/daily-publish.mjs`: it drains the queue oldest-first, re-checks each URL via `scripts/curate.mjs`, and builds a fully tagged entry — name/category/tagline/description from the form, capability badges from the form's checkboxes plus automatic service-worker detection for "Works offline", a category emoji icon, and manifest screenshots. Published entries are always `verified: false` ("at your own risk"). Each issue gets a comment with the live link and is closed; the run commits, deploys, and opens a **digest issue** so the curator can spot-check what went live and remove anything that breaks the content rules (Curate catalog → remove).

Submissions that fail at publish time are returned to `checks-failed` with a comment; editing the issue re-runs the checks and requeues it.

Published apps carry `addedAt` and spend their first week solely on the homepage's **🆕 New apps — tell us what you think** shelf (right under Featured/Highly Useful) before graduating to their category — the 7-day window is applied client-side from the visitor's date, so no rebuild is needed. `/feed.xml` is an RSS feed of new listings.

## Community warnings (immediate suspension)

Every app's Details page has a **⚠ Report a problem** button: problem checkboxes plus required commentary, written to a private Supabase `warnings` table (`supabase/add-warnings.sql`; no select policy — reports are never shown publicly). Any unprocessed warning **immediately suspends** the listing: rows disappear from the home and community pages and the Open button is replaced by a "suspended pending review" notice (checked live via the aggregate-only `suspended_apps` view — no rebuild to suspend or restore). The notifier emails each warning immediately with an unmissable `⚠️ APP WARNING` subject — outside the hourly cap — and opens an `app-warning` GitHub issue. Review flagged apps on a safe machine/VM (urlscan.io first); then either remove the listing (Curate catalog → remove) or restore it by setting `processed = true` in the Supabase dashboard.

## urlscan.io reputation checks

`scripts/urlscan-check.mjs` submits URLs to [urlscan.io](https://urlscan.io) and reads the malicious/clean verdict (advisory — a clean scan is not proof of safety). With a free API key in the `URLSCAN_API_KEY` repo secret, the weekly check fresh-scans every listing (malicious verdicts open a review issue) and every community submission is scanned before it can queue. Without the key those steps skip quietly; `node scripts/urlscan-check.mjs --all` with no key falls back to searching urlscan's existing public scans.

## Weekly verification check

`npm run check` runs `scripts/check-listings.mjs` against every listing:

- **Hard failures** (unreachable, HTTP error, downgrade to http://, redirect to a different domain) mean the listing no longer passes verification.
- **Warnings** (bot-blocked responses, missing manifest tag) are surfaced for manual review and never revoke a badge automatically.

Report-only by default; `npm run check -- --apply` stamps `lastChecked` on every entry and sets `verified: false` on hard failures (rebuild afterwards to publish). The script never re-grants `verified: true` — restoring a badge is a manual decision, since verification also includes cross-referencing authoritative sources.

`weekly-check.yml` runs it with `--apply` every Monday at 06:00 UTC (the daily publish only checks incoming apps, never the existing list), commits the result, redeploys, and opens an issue when there are hard failures.

## Screenshots

`npm run screenshots` reads every listed app's web app manifest and saves up to 4 validated screenshot URLs per app to `src/data/screenshots.json`; detail pages render them as a scrollable strip. Images are hotlinked from each app's own origin, so re-run the script occasionally (and rebuild) to refresh or prune dead ones.

## Roadmap

- Blended popularity score (votes + traffic rank + GitHub stars)
- Sign-in-gated voting if anonymous voting gets abused
