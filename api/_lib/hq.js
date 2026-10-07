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
    /* Always a FRESH answer from HQ: after HQ purges our cache, the refetch must not get HQ's own CDN copy
       back (Terminal 3 + Terminal 9, 7 Oct — "Content Hub posts not publishing" was stacked caches). */
    const sep = query.includes('?') ? '&' : '?';
    const res = await fetch(HQ_BLOG_API + query + `${sep}_=${Date.now()}`, {
      signal: controller.signal,
      cache: 'no-store',
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

/* ── Demo booking (server-to-server; CEO ruling 2026-10-01) ────────────────────
   The website's /book page talks only to the website's /api/book, which calls
   HQ's booking API from here. BOOKING_PROXY_SECRET, when set in this project's
   env, is sent so HQ can refuse anyone but the website. */
const HQ_BOOK_API = 'https://hq.skillgrow.co.uk/api/book';
/* Each HQ host with a booking page; '' (plain /book) is Tunde. */
const BOOK_HOSTS = ['tunde', 'rubab', 'kajal'];
const BOOK_TIMEOUT_MS = 25000;   // a booking creates a calendar event and sends two emails

async function hqBook(method, { query = '', body, bookerIp } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), method === 'GET' ? TIMEOUT_MS * 3 : BOOK_TIMEOUT_MS);
  const headers = { accept: 'application/json' };
  if (body) headers['content-type'] = 'application/json';
  const secret = (process.env.BOOKING_PROXY_SECRET || '').trim();
  if (secret) headers['x-booking-proxy-secret'] = secret;
  if (bookerIp) headers['x-booker-ip'] = bookerIp;
  try {
    const res = await fetch(HQ_BOOK_API + query, {
      method, headers, signal: controller.signal, body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (_) { /* non-JSON error body */ }
    return { status: res.status, json };
  } catch (err) {
    console.error('hq: booking call failed —', err && err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
const fetchAvailability = (host) => hqBook('GET', { query: `?username=${encodeURIComponent(host)}` });
const createBooking = (booking, bookerIp, host) => hqBook('POST', { body: { ...booking, username: host }, bookerIp });

/* ── Team page (server-to-server; CEO 2026-10-05) ─────────────────────────────────
   HQ's opted-in team members ("Show my photo and profile on the public website" in HQ).
   HQ answers only with WEBSITE_TEAM_SECRET (this project's env) and only for people who
   are active AND opted in; it never sends email or phone. The photo URL it gives is an
   HQ address, so it is used here, server-side, and never reaches a visitor's browser. */
const HQ_TEAM_API = 'https://hq.skillgrow.co.uk/api/public/team';
const HQ_ORIGIN = 'https://hq.skillgrow.co.uk';

function teamHeaders() {
  const secret = (process.env.WEBSITE_TEAM_SECRET || '').trim();
  return secret ? { 'x-website-secret': secret } : null;
}

/* Cache rules for the team list and photos (CEO 2026-10-05, privacy: an opt-out must leave the site
 * within a minute). Every cached copy carries the tag 'team', which /api/team-revalidate deletes when
 * HQ reports a change. Without that call: the CDN keeps a copy 30 s at most and never serves it stale
 * (no stale-while-revalidate, which kept an opted-out list for minutes); browsers re-check every time. */
const TEAM_CACHE_TAG = 'team';
/* Same rules for anything built from HQ's Content Hub (blog list, post pages, sitemap): tagged 'blog',
   CDN 60 s max, never stale, browsers re-check. HQ calls /api/team-revalidate?tag=blog on publish /
   unpublish / edit, which deletes every 'blog' copy at once. */
const BLOG_CACHE_TAG = 'blog';
const REVALIDATE_TAGS = [TEAM_CACHE_TAG, BLOG_CACHE_TAG];
function setTeamCacheHeaders(res, tags, cdnSeconds = 30) {
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('Vercel-CDN-Cache-Control', `max-age=${cdnSeconds}`);
  res.setHeader('Vercel-Cache-Tag', tags.join(','));
}

/* True when `given` is the shared WEBSITE_TEAM_SECRET (constant time; false when unset). */
function teamSecretMatches(given) {
  const secret = (process.env.WEBSITE_TEAM_SECRET || '').trim();
  if (!secret || typeof given !== 'string') return false;
  const a = Buffer.from(given.trim()), b = Buffer.from(secret);
  return a.length === b.length && require('crypto').timingSafeEqual(a, b);
}

/* [{ id, name, title, bio, photoUrl, photoVersion }] or null (no secret, HQ down, bad JSON). */
async function fetchTeam() {
  const headers = teamHeaders();
  if (!headers) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(HQ_TEAM_API, { signal: controller.signal, cache: 'no-store', headers: { accept: 'application/json', ...headers } });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || !Array.isArray(json.members)) return null;
    return json.members
      .filter(m => m && typeof m.id === 'string' && /^[0-9a-f-]{36}$/i.test(m.id) && m.name)
      .map(m => ({
        id: m.id,
        name: String(m.name).slice(0, 80),
        title: m.title ? String(m.title).slice(0, 80) : '',
        bio: m.bio ? String(m.bio).slice(0, 400) : '',
        /* Only an HQ photo URL is ever fetched — never an arbitrary host from the payload. */
        photoUrl: typeof m.photo_url === 'string' && m.photo_url.startsWith(HQ_ORIGIN + '/') ? m.photo_url : null,
        photoVersion: m.photo_version != null ? String(m.photo_version).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64) : '',
      }));
  } catch (err) {
    console.error('hq: team fetch failed —', err && err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* The photo bytes for an opted-in member: { type, body } or null. */
async function fetchTeamPhoto(photoUrl) {
  const headers = teamHeaders();
  if (!headers || !photoUrl) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS * 2);
  try {
    const res = await fetch(photoUrl, { signal: controller.signal, cache: 'no-store', headers: { accept: 'image/webp,image/*', ...headers } });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !/^image\/(webp|jpeg|png)$/.test(type.split(';')[0])) return null;
    const body = Buffer.from(await res.arrayBuffer());
    return body.length && body.length <= 2 * 1024 * 1024 ? { type: type.split(';')[0], body } : null;
  } catch (err) {
    console.error('hq: team photo fetch failed —', err && err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchPosts, fetchPost, HQ_BLOG_API, fetchAvailability, createBooking, BOOK_HOSTS, fetchTeam, fetchTeamPhoto, TEAM_CACHE_TAG, BLOG_CACHE_TAG, REVALIDATE_TAGS, setTeamCacheHeaders, teamSecretMatches };
