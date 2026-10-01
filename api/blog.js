/* GET /api/blog?limit=N — the HQ Content Hub's published posts for the /blog page.
 *
 * Fetched here, server-side, so the public site's pages never contain or call a portal
 * address (CEO ruling 2026-10-01). Same shape as the HQ API: { posts: [...] }.
 * null from the reader (HQ down, timeout, bad JSON) becomes a 503 — the page then keeps
 * the articles it ships with, exactly as when it called HQ directly.
 */
const { fetchPosts } = require('./_lib/hq');

module.exports = async function handler(req, res) {
  const limit = Math.min(Math.max(parseInt((req.query && req.query.limit) || '50', 10) || 50, 1), 100);
  const posts = await fetchPosts(limit);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.statusCode = posts === null ? 503 : 200;
  return res.end(JSON.stringify({ posts: posts === null ? null : posts }));
};
