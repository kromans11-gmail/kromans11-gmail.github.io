# PWA Finder

A curated, ranked directory of the best Progressive Web Apps — itself built as a PWA.

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
| `npm run check`   | Re-check all listings (monthly verification) |
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

`verified: true` shows a green "✔ Verified" badge linking to `/verification/`, which documents the checks (official canonical URL, cross-referenced authoritative sources, monthly re-checks). Unverified apps show an amber "⚠ At your own risk" badge instead, pointing to the planned community-contributed sister site (set its URL in `src/pages/verification.astro`).

Capability keys are defined in `src/data/capabilities.ts`. Popularity is a 0–100 score, editorially seeded in v1.

Apps with `"spotlight": true` join the rotation pool: each day 3 of them appear under ✨ Featured and the rest under ⭐ Highly Useful, and the window shifts daily (computed from the visitor's date, so no rebuild is needed).

## Monthly verification check

`npm run check` runs `scripts/check-listings.mjs` against every listing:

- **Hard failures** (unreachable, HTTP error, downgrade to http://, redirect to a different domain) mean the listing no longer passes verification.
- **Warnings** (bot-blocked responses, missing manifest tag) are surfaced for manual review and never revoke a badge automatically.

Report-only by default; `npm run check -- --apply` stamps `lastChecked` on every entry and sets `verified: false` on hard failures (rebuild afterwards to publish). The script never re-grants `verified: true` — restoring a badge is a manual decision, since verification also includes cross-referencing authoritative sources.

Run it monthly by hand, or schedule it (e.g. a monthly GitHub Actions cron once the repo is on GitHub) — non-zero exit on failures makes it CI-friendly.

## Screenshots

`npm run screenshots` reads every listed app's web app manifest and saves up to 4 validated screenshot URLs per app to `src/data/screenshots.json`; detail pages render them as a scrollable strip. Images are hotlinked from each app's own origin, so re-run the script occasionally (and rebuild) to refresh or prune dead ones.

## Roadmap

- Blended popularity score (votes + traffic rank + GitHub stars)
- Sign-in-gated voting if anonymous voting gets abused
