// RSS feed of newly listed apps — the zero-account way to hear about new
// listings (feed readers and mail-forwarding services can sit on top of it).
import apps from '../data/apps.json';

const SITE = 'https://webappfinder.app';
const esc = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

export async function GET() {
  const items = apps
    .filter((a) => a.addedAt)
    .sort((a, b) => (b.addedAt < a.addedAt ? -1 : 1))
    .slice(0, 30)
    .map((a) =>
      [
        '<item>',
        `<title>${esc(a.name)}</title>`,
        `<link>${SITE}/apps/${a.slug}/</link>`,
        `<guid isPermaLink="true">${SITE}/apps/${a.slug}/</guid>`,
        `<pubDate>${new Date(a.addedAt).toUTCString()}</pubDate>`,
        `<category>${esc(a.category)}</category>`,
        `<description>${esc(a.tagline)}</description>`,
        '</item>',
      ].join('')
    );

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0"><channel>` +
    `<title>Web App Finder — new apps</title>` +
    `<link>${SITE}/</link>` +
    `<description>Newly listed Progressive Web Apps on Web App Finder.</description>` +
    items.join('') +
    `</channel></rss>`;

  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  });
}
