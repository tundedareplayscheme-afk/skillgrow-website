/* GET /team-photo/<id>.webp?v=<version> (rewritten to /api/team-photo?id=<id>) — a team
 * member's photo, served by this site.
 *
 * Only for someone opted in RIGHT NOW, and only at their CURRENT photo URL:
 *   - every uncached request re-reads HQ's opted-in list (never cached on our side);
 *   - ?v= must equal the version HQ gives for them now. HQ changes it when the photo changes and
 *     when the switch goes off or on, so an old URL — and any copy cached under it — never
 *     resolves again;
 *   - cached copies are tagged 'team' and deleted by /api/team-revalidate when HQ reports a change;
 *     failing that the CDN keeps one 30 s at most, never serves it stale, and browsers re-check.
 * Anything else is a 404, never cached, and the page falls back to the initials.
 */
const { fetchTeam, fetchTeamPhoto, TEAM_CACHE_TAG, setTeamCacheHeaders } = require('./_lib/hq');

module.exports = async function handler(req, res) {
  const q = req.query || {};
  const id = String(q.id || '').toLowerCase();
  const v = String(q.v || '');
  const notFound = () => { res.statusCode = 404; res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vercel-CDN-Cache-Control', 'no-store'); return res.end(); };
  if (!/^[0-9a-f-]{36}$/.test(id)) return notFound();

  const team = await fetchTeam();
  const member = team && team.find(m => m.id === id);
  if (!member || !member.photoUrl) return notFound();
  if ((member.photoVersion || '') !== v) return notFound();

  const photo = await fetchTeamPhoto(member.photoUrl);
  if (!photo) return notFound();

  res.statusCode = 200;
  res.setHeader('Content-Type', photo.type);
  setTeamCacheHeaders(res, [TEAM_CACHE_TAG, `team-photo-${id}`]);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end(photo.body);
};
