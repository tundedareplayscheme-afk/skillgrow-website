/* GET/POST /api/book — the website's own "Book a Demo" endpoint.
 *
 * CEO ruling 2026-10-01: the booking page lives on the website, and no visitor's
 * browser ever shows or calls an HQ address. This function calls HQ's booking API
 * server-to-server (api/_lib/hq.js) and returns only what the page needs.
 *
 *   GET  → { host: { name, title, bio }, config: { durationMins, timezone, title, description },
 *            days: [{ date, weekday, label, slots: [{ time, label }] }] }
 *   POST { name, email, organisation, role?, phone?, message?, date, time, website (honeypot) }
 *        → 200 { success, date, time, meetLink? } · 400 { error, fields } · 409 { error, taken }
 *          · 503 { error }
 */
const { fetchAvailability, createBooking } = require('./_lib/hq');

const oneLine = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const send = (res, status, obj) => { res.statusCode = status; return res.end(JSON.stringify(obj)); };
const UNAVAILABLE = 'Online booking is temporarily unavailable. Please email hello@skillgrow.co.uk and we will arrange a time.';

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const r = await fetchAvailability();
    if (!r || r.status !== 200 || !r.json || !Array.isArray(r.json.days)) return send(res, 503, { error: UNAVAILABLE });
    const { host = {}, config = {}, days } = r.json;
    return send(res, 200, {
      host: { name: host.name || '', title: host.title || '', bio: host.bio || '' },          // never the host's email
      config: { durationMins: config.durationMins, timezone: config.timezone, title: config.title, description: config.description },
      days,
    });
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
    if (!body || typeof body !== 'object') return send(res, 400, { error: 'Invalid request' });
    if (oneLine(body.website, 100)) {
      console.log('book: honeypot tripped, discarding silently');
      return send(res, 200, { success: true });
    }
    const p = {
      name: oneLine(body.name, 120), email: oneLine(body.email, 200).toLowerCase(),
      organisation: oneLine(body.organisation, 200), role: oneLine(body.role, 120),
      phone: oneLine(body.phone, 40), message: String(body.message == null ? '' : body.message).trim().slice(0, 2000),
      date: oneLine(body.date, 10), time: oneLine(body.time, 5),
    };
    const fields = [];
    if (!p.name) fields.push('name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) fields.push('email');
    if (!p.organisation) fields.push('organisation');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !/^\d{2}:\d{2}$/.test(p.time)) fields.push('time');
    if (fields.length) return send(res, 400, { error: 'Please check the highlighted fields', fields });

    /* Only a time HQ is offering right now can be booked: HQ's POST checks the time is in the
       future but not that it is one of the host's slots (a 03:00 request was accepted). */
    const avail = await fetchAvailability();
    if (!avail || avail.status !== 200 || !avail.json || !Array.isArray(avail.json.days)) return send(res, 503, { error: UNAVAILABLE });
    const offered = avail.json.days.some(d => d.date === p.date && Array.isArray(d.slots) && d.slots.some(t => t.time === p.time));
    if (!offered) return send(res, 409, { error: 'That time has just been taken. Please choose another.', taken: true });

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const r = await createBooking(p, ip);
    if (!r) return send(res, 503, { error: UNAVAILABLE });
    if (r.status === 200 && r.json && r.json.success) {
      return send(res, 200, { success: true, date: p.date, time: p.time, meetLink: r.json.meetLink || null });
    }
    if (r.status === 409) return send(res, 409, { error: 'That time has just been taken. Please choose another.', taken: true });
    if (r.status === 400) return send(res, 400, { error: (r.json && r.json.error) || 'Please check your details' });
    console.error('book: HQ returned', r.status, r.json && r.json.error);
    return send(res, 503, { error: UNAVAILABLE });
  }

  res.setHeader('Allow', 'GET, POST');
  return send(res, 405, { error: 'Method not allowed' });
};
