// T4, 11 Nov 2026: /api/dm-parents + /parents (node --test tests/). Fake fetch: nothing leaves this machine.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const handler = require('../api/dm-parents.js')

function call(body, { env = {}, hq = 200, brevo = 201, hqThrows = false } = {}) {
  const calls = []
  const saved = { ...process.env }
  for (const k of ['DAREMANOR_INTAKE_SECRET', 'BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'DM_PARENTS_FALLBACK_TO']) delete process.env[k]
  Object.assign(process.env, env)
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts, body: JSON.parse(opts.body) })
    if (url.includes('hq.skillgrow.co.uk')) { if (hqThrows) throw new Error('down'); return { status: hq, ok: hq < 300, json: async () => (hq === 400 ? { error: 'bad', fields: { email: 'x' } } : { ok: true }) } }
    return { status: brevo, ok: brevo < 300, text: async () => '' }
  }
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v }, end(s) { this.body = JSON.parse(s) } }
  const errs = []; const realErr = console.error; console.error = (...a) => errs.push(a.join(' '))
  return handler({ method: 'POST', body, headers: { 'x-forwarded-for': '203.0.113.9' } }, res)
    .then(() => ({ res, calls, errs }))
    .finally(() => { globalThis.fetch = realFetch; console.error = realErr; process.env = saved })
}
const good = (o = {}) => ({ name: 'Test Parent', email: 'parent@example.invalid', phone: '07700 900000', area: 'Lambeth', age_group: '8–11',
  interests: ['Saturday club', 'Nope'], message: 'Loves football', consent: { contact: true, marketing: false, version: 'dm-event-2026-11-v1' }, source: 'qr', ...o })
const SECRET = { DAREMANOR_INTAKE_SECRET: 's3cret-for-test', BREVO_API_KEY: 'k-test' }

test('the page shows the SAME consent wording, version, groups and interests as the server', () => {
  const html = readFileSync(new URL('../dm-parents.html', import.meta.url), 'utf8')
  for (const s of Object.values(handler.CONSENT[handler.CONSENT_VERSION])) assert.ok(html.includes(JSON.stringify(s).slice(1, -1)), s)
  assert.ok(html.includes(`'${handler.CONSENT_VERSION}'`))
  for (const a of handler.AGE_GROUPS) assert.ok(html.includes(`'${a}'`), a)
  for (const i of handler.INTERESTS) assert.ok(html.includes(`'${i}'`), i)
  assert.ok(html.includes("Please don't include medical details."))
  assert.ok(html.includes('https://daremanoractivities.com/privacy'))
  assert.ok(!/skillgrow\.co\.uk\/api|hq\.skillgrow/.test(html), 'the browser never calls HQ')
})

test('a good sign-up goes to HQ DAREManor family intake, with the extra answers in the message', async () => {
  const { res, calls } = await call(good(), { env: SECRET })
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body, { ok: true })
  assert.equal(calls.length, 1)
  const c = calls[0]
  assert.equal(c.url, 'https://hq.skillgrow.co.uk/api/public/daremanor/enquiry')
  assert.equal(c.opts.headers['x-daremanor-intake-secret'], 's3cret-for-test')
  assert.equal(c.opts.headers['x-submitter-ip'], '203.0.113.9')
  assert.equal(c.body.kind, 'family'); assert.equal(c.body.age_range, 'not_sure'); assert.equal(c.body.email, 'parent@example.invalid')
  assert.equal(c.body.test, true, '@example.invalid is a test')
  assert.equal(c.body.consent.version, 'dm-event-2026-11-v1')
  assert.equal(c.body.consent.text, handler.CONSENT['dm-event-2026-11-v1'].contact)
  assert.match(c.body.message, /^Event: DAREManor parents event 11 Nov 2026 \(dm_parents_2026_11_11, QR code\)/)
  assert.match(c.body.message, /Child's age group: 8–11/); assert.match(c.body.message, /Interested in: Saturday club\n/)
  assert.match(c.body.message, /Borough \/ area: Lambeth/); assert.match(c.body.message, /Marketing: no/); assert.match(c.body.message, /Parent's note: Loves football$/)
  assert.ok(c.body.message.length <= 2000)
  assert.ok(!('organisation' in c.body) && !('area' in c.body) && !('interests' in c.body), 'only fields HQ stores')
})

test('marketing ticked → the wording stored includes the marketing sentence; the browser cannot supply wording', async () => {
  const { calls } = await call(good({ consent: { contact: true, marketing: true, text: 'I agree to anything', version: 'evil' } }), { env: SECRET })
  const w = handler.CONSENT['dm-event-2026-11-v1']
  assert.equal(calls[0].body.consent.text, `${w.contact} ${w.marketing}`); assert.equal(calls[0].body.consent.version, 'dm-event-2026-11-v1')
  assert.match(calls[0].body.message, /Marketing: yes/)
})

test('required: name, email, contact consent (nothing is sent)', async () => {
  const { res, calls } = await call(good({ name: ' ', email: 'nope', consent: { contact: false } }), { env: SECRET })
  assert.equal(res.statusCode, 400); assert.deepEqual(Object.keys(res.body.fields).sort(), ['consent', 'email', 'name']); assert.equal(calls.length, 0)
})

test('mobile, area, age group, interests and note are optional', async () => {
  const { res, calls } = await call({ name: 'A', email: 'a@example.invalid', consent: { contact: true } }, { env: SECRET })
  assert.equal(res.statusCode, 200); assert.match(calls[0].body.message, /age group: \(not given\)/); assert.ok(!('phone' in calls[0].body))
})

test('a long note is cut so the whole message fits HQ (2000)', async () => {
  const { calls } = await call(good({ message: 'x'.repeat(5000) }), { env: SECRET })
  assert.ok(calls[0].body.message.length <= 2000)
})

test('the honeypot is accepted silently and nothing is sent', async () => {
  const { res, calls } = await call(good({ website: 'http://spam' }), { env: SECRET })
  assert.equal(res.statusCode, 200); assert.equal(calls.length, 0)
})

test('HQ 400 is passed back; 429 is passed back; no fallback email for either', async () => {
  let r = await call(good(), { env: SECRET, hq: 400 }); assert.equal(r.res.statusCode, 400); assert.equal(r.calls.length, 1)
  r = await call(good(), { env: SECRET, hq: 429 }); assert.equal(r.res.statusCode, 429); assert.equal(r.calls.length, 1)
})

for (const [why, opts] of [['HQ 503', { hq: 503 }], ['HQ unreachable', { hqThrows: true }], ['no secret', { env: { BREVO_API_KEY: 'k-test' } }]]) {
  test(`fallback (${why}): emailed to DAREManor's .co.uk inbox from the site's own sender, never .com; visitor sees ok`, async () => {
    const { res, calls } = await call(good({ consent: { contact: true, marketing: true } }), { env: SECRET, ...opts })
    assert.equal(res.statusCode, 200); assert.deepEqual(res.body, { ok: true, queued: true })
    const b = calls.find(c => c.url.includes('brevo')).body
    assert.deepEqual(b.to, [{ email: 'hello@daremanoractivities.co.uk', name: 'DAREManor Activities Centre' }])
    assert.ok(!/daremanoractivities\.com/.test(b.sender.email)); assert.equal(b.subject, '[TEST] DAREManor parents event sign-up')
    assert.ok(!b.subject.includes('Test Parent'), 'no name in the subject line')
    assert.match(b.textContent, /Age group: +8–11/); assert.match(b.textContent, /marketing=yes \(dm-event-2026-11-v1\)/)
  })
}

test('fallback fails too → 503 with DAREManor contact; the lead is NEVER written to the logs', async () => {
  const { res, errs } = await call(good({ message: 'SECRETNOTE' }), { env: { ...SECRET }, hq: 503, brevo: 500 })
  assert.equal(res.statusCode, 503); assert.match(res.body.error, /hello@daremanoractivities\.co\.uk/)
  assert.ok(!errs.join('\n').includes('SECRETNOTE') && !errs.join('\n').includes('parent@example.invalid'))
})

test('GET is refused', async () => {
  const res = { statusCode: 0, setHeader() {}, end(s) { this.body = s } }
  await handler({ method: 'GET', headers: {} }, res); assert.equal(res.statusCode, 405)
})

test('vercel.json serves /parents from dm-parents.html, noindex, and gives the function its timeout', () => {
  const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.ok(v.rewrites.some(r => r.source === '/parents' && r.destination === '/dm-parents.html'))
  assert.ok(v.headers.some(h => h.source === '/parents' && h.headers.some(x => x.key === 'X-Robots-Tag')))
  assert.equal(v.functions['api/dm-parents.js'].maxDuration, 20)
})
