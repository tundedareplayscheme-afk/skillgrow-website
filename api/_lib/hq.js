/* Shared HQ Content Hub reader, used by api/page.js (link-preview tags),
 * api/sitemap.js (the URL list) and api/blog.js (the /blog page's posts).
 *
 * SERVER-ONLY (CEO ruling 2026-10-01: the public site never shows or calls a portal
 * address). It lives in api/_lib/: files under api/ are never served as static assets,
 * and the leading underscore keeps Vercel from deploying it as a function.
 *
 *
 * Every function here returns null on ANY failure — non-200, malformed JSON,
 * DNS, timeout. Callers treat null as "HQ had nothing to say" and fall back to
 * what the site ships with. The website must never be taken down by the HQ API
 * being down, which is the whole point of the fallback.
 */

const HQ_BLOG_API = 'https://hq.skillgrow.co.uk/api/content/blog';

/* A page render blocks on this, so it gets a short leash. Vercel's function
   timeout is far longer, but a visitor waiting on a slow HQ is worse than a
   visitor getting the three articles the site already has. */
const TIMEOUT_MS = 2500;

async function hqGet(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(HQ_BLOG_API + query, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    /* 503 means the Content Hub migration has not been applied; 404 on a slug
       means no such post. Both are "nothing to say", not errors to shout about. */
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('hq: blog fetch failed —', err && err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* All published posts, newest first. null on failure; [] is a real answer
   meaning HQ is up and has nothing published to the website yet. */
async function fetchPosts(limit = 50) {
  const json = await hqGet(`?limit=${encodeURIComponent(limit)}`);
  if (!json || !Array.isArray(json.posts)) return null;
  return json.posts.filter(p => p && p.slug && p.title);
}

/* One post by slug, or null if HQ does not know it. */
async function fetchPost(slug) {
  if (!slug) return null;
  const json = await hqGet(`?slug=${encodeURIComponent(slug)}`);
  if (!json || !json.post || !json.post.slug) return null;
  return json.post;
}

module.exports = { fetchPosts, fetchPost, HQ_BLOG_API };
