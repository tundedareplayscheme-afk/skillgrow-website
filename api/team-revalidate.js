/* POST /api/team-revalidate — HQ tells the site a public team profile changed (switch on/off,
 * photo, name, title or bio), and every cached copy of the team list and photos is deleted at once.
 * CEO 2026-10-05: withdrawing consent must take the photo and profile down promptly.
 *
 *   header x-website-secret: <WEBSITE_TEAM_SECRET>   (the same shared secret HQ already checks)
 *   → 204 purged · 401 wrong/missing secret · 405 not POST · 500 purge failed (HQ logs it; the
 *     30-second CDN limit in _lib/hq.js still applies)
 *
 * dangerouslyDeleteByTag with a 0 s deadline: the next request is served FRESH, never one more stale
 * copy (invalidateByTag would serve the stale one while it revalidates — wrong for an opt-out).
 */
const { dangerouslyDeleteByTag } = require('@vercel/functions');
const { TEAM_CACHE_TAG, REVALIDATE_TAGS, teamSecretMatches } = require('./_lib/hq');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.statusCode = 405; res.setHeader('Allow', 'POST'); return res.end(); }
  if (!teamSecretMatches(req.headers['x-website-secret'])) { res.statusCode = 401; return res.end(); }
  try {
    // ?tag=blog purges the Content Hub copies (blog list, post pages, sitemap); default 'team'. Allowlisted.
    const tag = String((req.query && req.query.tag) || TEAM_CACHE_TAG);
    if (!REVALIDATE_TAGS.includes(tag)) { res.statusCode = 400; return res.end(); }
    await dangerouslyDeleteByTag(tag, { revalidationDeadlineSeconds: 0 });
    res.statusCode = 204;
    return res.end();
  } catch (err) {
    console.error('team-revalidate: purge failed —', err && err.message);
    res.statusCode = 500;
    return res.end();
  }
};
