/* GET /api/team — the people who opted in to the website in HQ, for the /team page.
 *
 * Server-side, so no visitor's browser shows or calls an HQ address (CEO ruling 2026-10-01):
 * the photo is served by this site at /team-photo/<id>.webp?v=<version>.
 *   → 200 { members: [{ id, name, title, bio, photo }] }   photo: a site URL or null
 *   → 503 { members: null }   HQ unreachable / not configured — the page keeps its own list
 * Cached 5 minutes at the edge, so a profile switched off in HQ leaves the site within minutes;
 * a stale copy is served for up to an hour only while a fresh one is being fetched.
 */
const { fetchTeam } = require('./_lib/hq');

module.exports = async function handler(req, res) {
  const team = await fetchTeam();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (team === null) {
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 503;
    return res.end(JSON.stringify({ members: null }));
  }
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.statusCode = 200;
  return res.end(JSON.stringify({
    members: team.map(m => ({
      id: m.id, name: m.name, title: m.title, bio: m.bio,
      photo: m.photoUrl ? `/team-photo/${m.id}.webp${m.photoVersion ? `?v=${encodeURIComponent(m.photoVersion)}` : ''}` : null,
    })),
  }));
};
