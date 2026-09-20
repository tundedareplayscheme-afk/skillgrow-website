/* GET /api/sitemap — serves /sitemap.xml, with HQ Content Hub posts appended.
 *
 * Why this replaced the static sitemap.xml: on Vercel, static files are matched
 * BEFORE rewrites. While sitemap.xml existed on disk it would have won every
 * request and the rewrite below it could never fire, so a dynamic sitemap is
 * only possible once that file is gone. It was deleted in the same commit that
 * added this; the URLs it held are the STATIC_URLS list below, unchanged.
 *
 * The static list is the source of truth for everything that is part of the
 * site itself. HQ posts are APPENDED. If the HQ fetch fails we still emit a
 * complete, valid sitemap for the site — never an empty one, and never a 500,
 * because a broken sitemap is worse for search than a slightly stale one.
 */

const { fetchPosts } = require('../lib/hq');

const ORIGIN = 'https://www.skillgrow.co.uk';

/* Every page the site ships with. Keep in step with the META map in
   api/page.js and the rewrite list in vercel.json — those three are the
   site's own routes; anything beyond them now comes from HQ. */
const STATIC_URLS = [
  ['/', '2026-09-18'],
  ['/sen', '2026-09-18'],
  ['/mainstream', '2026-09-18'],
  ['/trust', '2026-09-18'],
  ['/parent', '2026-09-18'],
  ['/staff-pwa', '2026-09-18'],
  ['/pricing', '2026-09-18'],
  ['/faq', '2026-09-18'],
  ['/about', '2026-09-18'],
  ['/team', '2026-09-18'],
  ['/privacy', '2026-09-18'],
  ['/security', '2026-09-18'],
  ['/contact', '2026-09-18'],
  ['/terms', '2026-09-18'],
  ['/dpa', '2026-09-18'],
  ['/accessibility', '2026-09-18'],
  ['/implementation', '2026-09-18'],
  ['/integrations', '2026-09-18'],
  ['/blog', '2026-09-18'],
];

/* The three articles the site shipped with. They keep their URLs even once HQ
   is publishing: they are indexed and may have inbound links, so dropping them
   from the sitemap the day HQ gains its first post would throw away real pages.
   index.html keeps serving them for the same reason. */
const LEGACY_POSTS = [
  ['/blog/isps-what-every-senco-needs-to-know', '2026-09-18'],
  ['/blog/graduated-approach-practical-guide', '2026-09-18'],
  ['/blog/senco-admin-burden', '2026-09-18'],
];

/* &, < and > are the three characters that can break an XML document. Slugs
   are [a-z0-9-] by construction, but the sitemap is generated from data we do
   not own, so it is escaped rather than trusted. */
function xml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isoDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function urlEntry([loc, lastmod]) {
  const mod = lastmod ? `<lastmod>${xml(lastmod)}</lastmod>` : '';
  return `  <url><loc>${xml(ORIGIN + loc)}</loc>${mod}</url>`;
}

module.exports = async function handler(req, res) {
  const entries = [...STATIC_URLS, ...LEGACY_POSTS];
  const seen = new Set(entries.map(([loc]) => loc));

  const posts = await fetchPosts(200);
  if (posts) {
    for (const post of posts) {
      const loc = `/blog/${post.slug}`;
      if (seen.has(loc)) continue;
      seen.add(loc);
      entries.push([loc, isoDate(post.published_at)]);
    }
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(urlEntry),
    '</urlset>',
    '',
  ].join('\n');

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  /* Crawlers re-read this often; an hour at the CDN keeps HQ from being hit
     on every crawl while a new post still surfaces the same day. */
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.end(body);
};
