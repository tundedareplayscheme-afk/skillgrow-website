/* GET /team-photo/<id>.webp?v=<version> (rewritten to /api/team-photo?id=<id>) — a team
 * member's photo, served by this site.
 *
 * Only for someone currently opted in: the id must be in HQ's opted-in list right now, and
 * the bytes come from the photo URL HQ gives for them (HQ itself refuses once they opt out).
 * HQ already stores it as a 512px WebP with EXIF stripped. Cached 5 minutes, the same window
 * as the list; the ?v= version changes when the photo changes, so a new photo shows as soon
 * as the list does. Anything else is a 404 and the page falls back to the initials.
 */
const { fetchTeam, fetchTeamPhoto } = require('./_lib/hq');

module.exports = async function handler(req, res) {
  const id = String((req.query && req.query.id) || '').toLowerCase();
  const notFound = () => { res.statusCode = 404; res.setHeader('Cache-Control', 'public, s-maxage=60'); return res.end(); };
  if (!/^[0-9a-f-]{36}$/.test(id)) return notFound();

  const team = await fetchTeam();
  const member = team && team.find(m => m.id === id);
  if (!member || !member.photoUrl) return notFound();

  const photo = await fetchTeamPhoto(member.photoUrl);
  if (!photo) return notFound();

  res.statusCode = 200;
  res.setHeader('Content-Type', photo.type);
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=60');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end(photo.body);
};
