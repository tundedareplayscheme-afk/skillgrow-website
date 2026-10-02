/* POST /api/tes — Tes SEN Show 2026 lead form (www.skillgrow.co.uk/tes).
 *
 * Server-to-server with HQ, like /api/book: the visitor's browser only ever
 * calls this function. The lead goes to HQ's intake endpoint with the shared
 * secret; HQ stores the consent wording, version, time and IP as the record.
 *
 * So a lead is never lost on the stand: if HQ is unreachable, answers 5xx, or
 * the secret is not configured, the lead is emailed to the team inbox through
 * Brevo instead (the same route /api/contact uses) and the visitor still sees
 * "thank you". That email goes to our own inbox only, never to the visitor.
 *
 * Environment variables (Vercel, this project):
 *   LEAD_INTAKE_SECRET    shared with HQ (x-lead-intake-secret)
 *   BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME, CONTACT_TO — fallback email
 *   TURNSTILE_SECRET_KEY  optional — when set, a Turnstile token is required
 */
const HQ_INTAKE = 'https://hq.skillgrow.co.uk/api/hq/leads/intake';
const HQ_TIMEOUT_MS = 8000;
const EVENT = 'tes_2026';

/* The EXACT wording shown beside the boxes on /tes, by version. index.html
   renders the same strings (TES_CONSENT); a test asserts they match. */
const CONSENT = {
  'tes-2026-v1': {
    contact: 'I agree to SkillGrow contacting me about DARE after the Tes SEN Show, using the details above, as described in the SkillGrow privacy notice.',
    marketing: 'I would also like occasional SkillGrow news by email. I can unsubscribe at any time.',
  },
};
const CONSENT_VERSION = 'tes-2026-v1';

const ORG_TYPES = ['School', 'Academy Trust / MAT', 'Local Authority', 'Other'];
const INTERESTS = ['DARE SEN OS', 'DARE Mainstream', 'Staff PWA', 'Parent Portal', 'Trust Portal'];
const SOURCES = ['qr', 'stand'];

const oneLine = (v, max) => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').trim().slice(0, max);
const looksLikeEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const escapeHtml = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const send = (res, status, obj) => { res.statusCode = status; return res.end(JSON.stringify(obj)); };

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };
  if (!token) return { ok: false, reason: 'missing-token' };
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    const j = await r.json();
    return { ok: j.success === true, reason: (j['error-codes'] || []).join(',') };
  } catch (err) {
    console.error('tes: turnstile verify failed, allowing through:', err.message);   // never lose a real lead
    return { ok: true, degraded: true };
  }
}

/* → { status, json } from HQ, or null when HQ could not be asked or reached. */
async function postToHq(lead, ip) {
  const secret = (process.env.LEAD_INTAKE_SECRET || '').trim();
  if (!secret) { console.error('tes: LEAD_INTAKE_SECRET is not set — using the email fallback'); return null; }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HQ_TIMEOUT_MS);
  try {
    const r = await fetch(HQ_INTAKE, {
      method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-lead-intake-secret': secret, 'x-submitter-ip': ip || '' },
      body: JSON.stringify(lead),
    });
    let json = null;
    try { json = await r.json(); } catch (_) { /* non-JSON body */ }
    return { status: r.status, json };
  } catch (err) {
    console.error('tes: HQ intake unreachable —', err && err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function emailFallback(lead, why) {
  const apiKey = process.env.BREVO_API_KEY;
  const text = [
    `Tes SEN Show 2026 lead${lead.test ? ' (TEST)' : ''} — HQ intake unavailable (${why}); please add it to HQ by hand.`,
    '',
    `Name:          ${lead.name}`,
    `Email:         ${lead.email}`,
    `Organisation:  ${lead.organisation}`,
    `Org type:      ${lead.org_type || '(not given)'}`,
    `Role:          ${lead.role || '(not given)'}`,
    `Phone:         ${lead.phone || '(not given)'}`,
    `Interests:     ${(lead.interests || []).join(', ') || '(none)'}`,
    `Source:        ${lead.source}`,
    `Consent:       contact=yes, marketing=${lead.consent.marketing ? 'yes' : 'no'} (${lead.consent.version})`,
    `Wording shown: ${lead.consent.text}`,
    `Received:      ${new Date().toISOString()}`,
    '',
    'Message:',
    lead.message || '(none)',
  ].join('\n');
  if (!apiKey) { console.error('tes: BREVO_API_KEY not set — UNDELIVERED LEAD follows\n' + text); return false; }
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: process.env.BREVO_SENDER_NAME || 'SkillGrow Website', email: process.env.BREVO_SENDER_EMAIL || 'hello@skillgrow.co.uk' },
        to: [{ email: process.env.CONTACT_TO || 'hello@skillgrow.co.uk', name: 'SkillGrow Team' }],
        subject: `${lead.test ? '[TEST] ' : ''}Tes lead — ${lead.name} from ${lead.organisation}`,
        textContent: text,
        htmlContent: `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
        replyTo: { email: lead.email, name: lead.name },
      }),
    });
    if (!r.ok) { console.error(`tes: Brevo ${r.status}: ${await r.text()}\nUNDELIVERED LEAD follows\n${text}`); return false; }
    return true;
  } catch (err) {
    console.error('tes: Brevo unreachable —', err.message, '\nUNDELIVERED LEAD follows\n' + text);
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
  if (oneLine(body.website, 100)) { console.log('tes: honeypot tripped, discarding silently'); return send(res, 200, { ok: true }); }

  const consentIn = body.consent && typeof body.consent === 'object' ? body.consent : {};
  const lead = {
    event: EVENT,
    name: oneLine(body.name, 200),
    email: oneLine(body.email, 320).toLowerCase(),
    organisation: oneLine(body.organisation, 200),
    role: oneLine(body.role, 200) || undefined,
    phone: oneLine(body.phone, 40) || undefined,
    org_type: ORG_TYPES.includes(body.org_type) ? body.org_type : undefined,
    interests: Array.isArray(body.interests) ? body.interests.filter(i => INTERESTS.includes(i)) : [],
    message: String(body.message == null ? '' : body.message).trim().slice(0, 2000) || undefined,
    source: SOURCES.includes(body.source) ? body.source : 'qr',
  };
  const fields = {};
  if (!lead.name) fields.name = 'Please enter your name';
  if (!looksLikeEmail(lead.email)) fields.email = 'Please enter a valid email address';
  if (!lead.organisation) fields.organisation = 'Please enter your school or organisation';
  if (consentIn.contact !== true) fields.consent = 'Please tick the box so we can contact you';
  if (Object.keys(fields).length) return send(res, 400, { error: 'Please check the highlighted fields', fields });

  /* The wording comes from the server's own copy for the version shown, never from the browser. */
  const wording = CONSENT[CONSENT_VERSION];
  const marketing = consentIn.marketing === true;
  lead.consent = {
    contact: true, marketing, version: CONSENT_VERSION,
    text: marketing ? `${wording.contact} ${wording.marketing}` : wording.contact,
  };
  if (body.test === true || /@example\.invalid$/.test(lead.email)) lead.test = true;

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ts = await verifyTurnstile(body.turnstileToken, ip);
  if (!ts.ok) return send(res, 400, { error: 'Spam check failed — please try again' });

  const hq = await postToHq(lead, ip);
  if (hq && hq.status === 200) return send(res, 200, { ok: true });
  if (hq && hq.status === 400) {
    return send(res, 400, { error: (hq.json && hq.json.error) || 'Please check your details', fields: (hq.json && hq.json.fields) || {} });
  }
  if (hq && hq.status === 429) return send(res, 429, { error: 'Too many submissions from this connection — please wait a minute and try again.' });

  const why = !hq ? 'no answer or not configured' : `HQ returned ${hq.status}`;
  if (await emailFallback(lead, why)) return send(res, 200, { ok: true, queued: true });
  return send(res, 503, { error: 'We could not save your details just now. Please try again, or email hello@skillgrow.co.uk.' });
};

module.exports.CONSENT = CONSENT;
module.exports.CONSENT_VERSION = CONSENT_VERSION;
