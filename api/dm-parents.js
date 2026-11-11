/* POST /api/dm-parents — DAREManor parents event sign-up (www.skillgrow.co.uk/parents), 11 Nov 2026.
 *
 * A clone of /api/tes for DAREManor Activities Centre. Server-to-server with HQ: the visitor's browser only
 * ever calls this function. The sign-up goes to HQ's DAREManor FAMILY enquiry intake
 * (/api/public/daremanor/enquiry → hq_daremanor_enquiries: HQ › DAREManor › Enquiries), NOT the SkillGrow
 * pipeline, so it sits under the DAREManor company with that table's retention and access rules.
 * HQ stores the consent wording and version as the record.
 *
 * That intake has no columns for this form's age groups, interests, area or event, and its age_range list
 * (6-10 / 11-14 / 15-19 / not_sure) does not match the event's groups. So the form sends age_range
 * 'not_sure' and puts those answers in the first lines of the message, where HQ shows them. No HQ change.
 *
 * So a sign-up is never lost: if HQ is unreachable, answers 5xx, or the secret is not set, the sign-up is
 * emailed to DAREManor's own inbox through Brevo (the same route /api/tes uses) and the visitor still sees
 * "thank you". That email goes to DAREManor's inbox only, never to the visitor, and never from the .com domain.
 *
 * Environment variables (Vercel, this project):
 *   DAREMANOR_INTAKE_SECRET  shared with HQ (x-daremanor-intake-secret)
 *   BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME  fallback email (sender stays the site's own)
 *   DM_PARENTS_FALLBACK_TO   optional; default hello@daremanoractivities.co.uk
 */
const HQ_INTAKE = 'https://hq.skillgrow.co.uk/api/public/daremanor/enquiry';
const HQ_TIMEOUT_MS = 8000;
const EVENT_SLUG = 'dm_parents_2026_11_11';
const EVENT_LABEL = 'DAREManor parents event 11 Nov 2026';
const FALLBACK_TO = () => process.env.DM_PARENTS_FALLBACK_TO || 'hello@daremanoractivities.co.uk';

/* The EXACT wording shown beside the boxes on /parents, by version. dm-parents.html renders the same
   strings (DM_CONSENT); a test asserts they match. */
const CONSENT = {
  'dm-event-2026-11-v1': {
    contact: 'I agree DAREManor Activities Centre may contact me about its activities and services. I can unsubscribe at any time.',
    marketing: 'I would also like to receive news and offers from DAREManor Activities Centre by email. I can unsubscribe at any time.',
  },
};
const CONSENT_VERSION = 'dm-event-2026-11-v1';

const AGE_GROUPS = ['Under 8', '8–11', '12–15', '16–19', '19–25'];
const INTERESTS = ['Saturday club', 'Holiday scheme', '19–25 provision', 'Other'];
const SOURCES = ['qr', 'stand'];
const MESSAGE_MAX = 2000;   // HQ's limit for the whole message

const oneLine = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
const looksLikeEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const escapeHtml = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const send = (res, status, obj) => { res.statusCode = status; return res.end(JSON.stringify(obj)); };

/* The answers HQ has no column for, as the first lines of the message (HQ keeps 2000 characters in all). */
function hqMessage(s) {
  const head = [
    `Event: ${EVENT_LABEL} (${EVENT_SLUG}, ${s.source === 'stand' ? 'stand tablet' : 'QR code'})`,
    `Child's age group: ${s.age_group || '(not given)'}`,
    `Interested in: ${s.interests.length ? s.interests.join(', ') : '(none ticked)'}`,
    `Borough / area: ${s.area || '(not given)'}`,
    `Marketing: ${s.marketing ? 'yes' : 'no'}`,
  ].join('\n');
  if (!s.message) return head;
  const room = MESSAGE_MAX - head.length - '\n\nParent\'s note: '.length;
  return `${head}\n\nParent's note: ${s.message.slice(0, Math.max(0, room))}`;
}

/* → { status, json } from HQ, or null when HQ could not be asked or reached. */
async function postToHq(body, ip) {
  const secret = (process.env.DAREMANOR_INTAKE_SECRET || '').trim();
  if (!secret) { console.error('dm-parents: DAREMANOR_INTAKE_SECRET is not set — using the email fallback'); return null; }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HQ_TIMEOUT_MS);
  try {
    const r = await fetch(HQ_INTAKE, {
      method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-daremanor-intake-secret': secret, 'x-submitter-ip': ip || '' },
      body: JSON.stringify(body),
    });
    let json = null;
    try { json = await r.json(); } catch (_) { /* non-JSON body */ }
    return { status: r.status, json };
  } catch (err) {
    console.error('dm-parents: HQ intake unreachable —', err && err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function emailFallback(s, consent, why) {
  const apiKey = process.env.BREVO_API_KEY;
  const text = [
    `${EVENT_LABEL} sign-up${s.test ? ' (TEST)' : ''} — HQ intake unavailable (${why}); please add it to HQ › DAREManor › Enquiries by hand.`,
    '',
    `Name:          ${s.name}`,
    `Email:         ${s.email}`,
    `Mobile:        ${s.phone || '(not given)'}`,
    `Borough/area:  ${s.area || '(not given)'}`,
    `Age group:     ${s.age_group || '(not given)'}`,
    `Interests:     ${s.interests.join(', ') || '(none)'}`,
    `Source:        ${s.source}`,
    `Consent:       contact=yes, marketing=${consent.marketing ? 'yes' : 'no'} (${consent.version})`,
    `Wording shown: ${consent.text}`,
    `Received:      ${new Date().toISOString()}`,
    '',
    'Anything they would like us to know:',
    s.message || '(none)',
  ].join('\n');
  if (!apiKey) { console.error('dm-parents: BREVO_API_KEY not set — sign-up could not be emailed'); return false; }
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'DAREManor parents form', email: process.env.BREVO_SENDER_EMAIL || 'hello@skillgrow.co.uk' },
        to: [{ email: FALLBACK_TO(), name: 'DAREManor Activities Centre' }],
        subject: `${s.test ? '[TEST] ' : ''}DAREManor parents event sign-up`,
        textContent: text,
        htmlContent: `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
        replyTo: { email: s.email, name: s.name },
      }),
    });
    if (!r.ok) { console.error(`dm-parents: Brevo ${r.status} — sign-up could not be emailed`); return false; }
    return true;
  } catch (err) {
    console.error('dm-parents: Brevo unreachable —', err.message);
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'Method not allowed' }); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
  if (!body || typeof body !== 'object') return send(res, 400, { error: 'Invalid request' });
  if (oneLine(body.website, 100)) { console.log('dm-parents: honeypot tripped, discarding silently'); return send(res, 200, { ok: true }); }

  const consentIn = body.consent && typeof body.consent === 'object' ? body.consent : {};
  const s = {
    name: oneLine(body.name, 200),
    email: oneLine(body.email, 320).toLowerCase(),
    phone: oneLine(body.phone, 40),
    area: oneLine(body.area, 100),
    age_group: AGE_GROUPS.includes(body.age_group) ? body.age_group : '',
    interests: Array.isArray(body.interests) ? INTERESTS.filter(i => body.interests.includes(i)) : [],
    message: String(body.message == null ? '' : body.message).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, MESSAGE_MAX),
    source: SOURCES.includes(body.source) ? body.source : 'qr',
  };
  const fields = {};
  if (!s.name) fields.name = 'Please enter your name';
  if (!looksLikeEmail(s.email)) fields.email = 'Please enter a valid email address';
  if (consentIn.contact !== true) fields.consent = 'Please tick the box so we can contact you';
  if (Object.keys(fields).length) return send(res, 400, { error: 'Please check the highlighted fields', fields });

  /* The wording comes from the server's own copy for the version shown, never from the browser. */
  const wording = CONSENT[CONSENT_VERSION];
  s.marketing = consentIn.marketing === true;
  const consent = {
    contact: true, marketing: s.marketing, version: CONSENT_VERSION,
    text: s.marketing ? `${wording.contact} ${wording.marketing}` : wording.contact,
  };
  s.test = body.test === true || /@example\.invalid$/.test(s.email);

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const hqBody = {
    kind: 'family', name: s.name, email: s.email, phone: s.phone || undefined, age_range: 'not_sure',
    message: hqMessage(s), consent: { contact: true, text: consent.text, version: consent.version },
    test: s.test || undefined,
  };
  const hq = await postToHq(hqBody, ip);
  if (hq && hq.status === 200) return send(res, 200, { ok: true });
  if (hq && hq.status === 400) {
    return send(res, 400, { error: (hq.json && hq.json.error) || 'Please check your details', fields: (hq.json && hq.json.fields) || {} });
  }
  if (hq && hq.status === 429) return send(res, 429, { error: 'Too many sign-ups from this connection — please wait a minute and try again.' });

  const why = !hq ? 'no answer or not configured' : `HQ returned ${hq.status}`;
  if (await emailFallback(s, consent, why)) return send(res, 200, { ok: true, queued: true });
  return send(res, 503, { error: 'We could not save your details just now. Please try again, or email hello@daremanoractivities.co.uk.' });
};

module.exports.CONSENT = CONSENT;
module.exports.CONSENT_VERSION = CONSENT_VERSION;
module.exports.AGE_GROUPS = AGE_GROUPS;
module.exports.INTERESTS = INTERESTS;
module.exports.hqMessage = hqMessage;
