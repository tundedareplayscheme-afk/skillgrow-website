/* POST /api/contact — receives a website enquiry and emails it to the team.
 *
 * Sends via Brevo's transactional REST API with plain fetch, deliberately:
 * this repo has no package.json and no build step, and pulling in
 * @getbrevo/brevo (as dare-sen/app/lib/email.js does) would mean node_modules
 * for a single HTTP call.
 *
 * Environment variables (set in the Vercel dashboard for this project):
 *   BREVO_API_KEY         required — the route 500s without it
 *   BREVO_SENDER_EMAIL    optional — MUST be a Brevo-verified sender.
 *                         BREVO_SETUP.md verifies noreply@skillgrow.co.uk;
 *                         set this if Brevo rejects the default.
 *   BREVO_SENDER_NAME     optional — display name on the email
 *   CONTACT_TO            optional — defaults to hello@skillgrow.co.uk
 *   TURNSTILE_SECRET_KEY  optional — when set, a Turnstile token is required
 */

const TO_DEFAULT = 'hello@skillgrow.co.uk';
const SENDER_EMAIL_DEFAULT = 'hello@skillgrow.co.uk';
const SENDER_NAME_DEFAULT = 'SkillGrow Website';

const PRODUCTS = ['DARE SEN OS', 'DARE Mainstream', 'Staff PWA', 'Parent Portal', 'Trust Portal'];

const MAX = { name: 200, organisation: 200, role: 200, email: 320, phone: 40, subject: 150, message: 5000 };

/* Keep user text out of the header block of the email. A newline smuggled
   into the subject would let a sender forge headers. */
function oneLine(v, limit) {
  return String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').trim().slice(0, limit);
}

function escapeHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Deliberately permissive — the real check is the confirmation reply.
   Rejecting unusual-but-valid addresses loses genuine enquiries. */
function looksLikeEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };
  if (!token) return { ok: false, reason: 'missing-token' };
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const j = await r.json();
    return { ok: j.success === true, reason: (j['error-codes'] || []).join(',') };
  } catch (err) {
    /* Cloudflare unreachable. Fail open rather than lose a real enquiry —
       the honeypot still applies and the mail is clearly attributable. */
    console.error('turnstile verify failed, allowing through:', err.message);
    return { ok: true, degraded: true };
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = null; }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  /* Honeypot: a field hidden from humans and left empty by them. A bot that
     fills every input trips it. Answer 200 so the bot believes it worked. */
  if (oneLine(body.website, 100)) {
    console.log('contact: honeypot tripped, discarding silently');
    return res.status(200).json({ ok: true });
  }

  const name = oneLine(body.name, MAX.name);
  const organisation = oneLine(body.organisation, MAX.organisation);
  const role = oneLine(body.role, MAX.role);
  const email = oneLine(body.email, MAX.email);
  /* Optional — a blank phone must never block an enquiry. */
  const phone = oneLine(body.phone, MAX.phone);
  /* Optional — pre-filled by links such as the Parent Portal page's. */
  const topic = oneLine(body.subject, MAX.subject);
  const message = String(body.message == null ? '' : body.message).trim().slice(0, MAX.message);

  const missing = [];
  if (!name) missing.push('name');
  if (!organisation) missing.push('organisation');
  if (!role) missing.push('role');
  if (!email) missing.push('email');
  if (missing.length) {
    return res.status(400).json({ error: 'Missing required fields', fields: missing });
  }
  if (!looksLikeEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address', fields: ['email'] });
  }
  if (body.consent !== true) {
    return res.status(400).json({ error: 'Consent is required', fields: ['consent'] });
  }

  /* Only accept products we actually offer, so the email can't be used to
     render arbitrary attacker-chosen strings to whoever reads it. */
  const products = Array.isArray(body.products)
    ? body.products.map(p => oneLine(p, 60)).filter(p => PRODUCTS.includes(p))
    : [];

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const turnstile = await verifyTurnstile(body.turnstileToken, ip);
  if (!turnstile.ok) {
    return res.status(400).json({ error: 'Spam check failed', reason: turnstile.reason });
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error('contact: BREVO_API_KEY is not set — cannot send enquiry from', email);
    return res.status(500).json({ error: 'Email is not configured' });
  }

  const to = process.env.CONTACT_TO || TO_DEFAULT;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || SENDER_EMAIL_DEFAULT;
  const senderName = process.env.BREVO_SENDER_NAME || SENDER_NAME_DEFAULT;
  const subject = `${topic || 'New enquiry'} — ${name} from ${organisation}`;
  const productLine = products.length ? products.join(', ') : '(none specified)';
  const received = new Date().toISOString();

  const textContent = [
    `Subject:       ${topic || '(none)'}`,
    `Name:          ${name}`,
    `Organisation:  ${organisation}`,
    `Role:          ${role}`,
    `Email:         ${email}`,
    `Phone:         ${phone || '(not given)'}`,
    `Products:      ${productLine}`,
    '',
    'Message:',
    message || '(no message)',
    '',
    '—',
    `Received: ${received}`,
    'Sent from the contact form at www.skillgrow.co.uk',
  ].join('\n');

  const htmlContent = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;color:#0F2D52;line-height:1.6">
  <h2 style="font-size:18px;margin:0 0 16px">New SkillGrow enquiry</h2>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px">
    <tr><td style="padding:4px 16px 4px 0;color:#64748B">Subject</td><td style="padding:4px 0">${topic ? escapeHtml(topic) : '<em style="color:#94A3B8">(none)</em>'}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748B">Name</td><td style="padding:4px 0"><strong>${escapeHtml(name)}</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748B">Organisation</td><td style="padding:4px 0"><strong>${escapeHtml(organisation)}</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748B">Role</td><td style="padding:4px 0">${escapeHtml(role)}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748B">Email</td><td style="padding:4px 0"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748B">Phone</td><td style="padding:4px 0">${phone ? `<a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ''))}">${escapeHtml(phone)}</a>` : '<em style="color:#94A3B8">(not given)</em>'}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748B">Products</td><td style="padding:4px 0">${escapeHtml(productLine)}</td></tr>
  </table>
  <div style="color:#64748B;margin-bottom:6px">Message</div>
  <div style="white-space:pre-wrap;padding:14px 16px;background:#FAFAF7;border-radius:10px;border:1px solid rgba(15,45,82,0.08)">${escapeHtml(message) || '<em style="color:#94A3B8">(no message)</em>'}</div>
  <p style="color:#94A3B8;font-size:12px;margin-top:20px">Received ${escapeHtml(received)} · contact form at www.skillgrow.co.uk</p>
</div>`;

  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to, name: 'SkillGrow Team' }],
        subject,
        htmlContent,
        textContent,
        /* So hitting Reply in the inbox answers the enquirer, not ourselves —
           sender and recipient are both hello@, so without this Reply loops. */
        replyTo: { email, name },
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      /* Log the enquiry itself: if Brevo is down, the daily cap is hit, or the
         sender is unverified, the content stays recoverable from the logs. */
      console.error(`contact: Brevo returned ${r.status}: ${detail}`);
      console.error('contact: undelivered enquiry follows\n' + textContent);
      return res.status(500).json({ error: 'Could not send enquiry' });
    }

    const sent = await r.json().catch(() => ({}));
    console.log(`contact: sent enquiry from ${email} (brevo messageId ${sent.messageId || 'unknown'})`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('contact: send threw:', err && err.message);
    console.error('contact: undelivered enquiry follows\n' + textContent);
    return res.status(500).json({ error: 'Could not send enquiry' });
  }
};
