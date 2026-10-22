import apps from './apps.json';

// Kent 2026-10-22: show only his own apps (kromans-*) and fully verified listings. Everything else stays in
// apps.json but is left out of the built site (listings, detail pages, feed, community page).
// "hidden": true removes an entry even when it is his own or verified.
const isOwn = (app: (typeof apps)[number]) => app.slug.startsWith('kromans-');

export const visibleApps = apps.filter(
  (app) => !(app as { hidden?: boolean }).hidden && (app.verified === true || isOwn(app)),
);

export default visibleApps;
