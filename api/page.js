/* GET /api/page?page=<slug> — serves index.html with that page's head.
 *
 * Why this exists: the site is one index.html rendered by a client-side
 * router, and Facebook, LinkedIn and WhatsApp do not run JavaScript. Without
 * this, every shared link would preview as the homepage, whichever page was
 * shared, and every page would carry the same meta description.
 *
 * vercel.json rewrites the thirteen non-home routes here. '/' is NOT routed here:
 * static files win over rewrites on Vercel, so the root is served straight
 * from index.html, whose META block already holds the homepage's tags. Keep
 * the 'home' entry below in step with that block.
 *
 * index.html reaches the function through "includeFiles" in vercel.json —
 * fs reads are invisible to Vercel's dependency tracing, so removing that
 * line would make every route here fall back to the hash redirect.
 *
 * Re-rendering og-image.png after editing og-image.svg (no build step here,
 * so it is done by hand and committed):
 *   node -e "const{chromium}=require(process.env.HOME+'/projects/skillgrow-hq/node_modules/playwright');(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});const p=await b.newPage({viewport:{width:1200,height:630}});await p.goto('file://'+process.cwd()+'/og-image.svg');await p.screenshot({path:'og-image.png'});await b.close()})()"
 */

const fs = require('fs');
const path = require('path');

const ORIGIN = 'https://www.skillgrow.co.uk';
const OG_IMAGE = `${ORIGIN}/og-image.png`;
const IMAGE_ALT = 'SkillGrow — the fully integrated 0–25 SEND platform';

/* title: the browser tab and the search result heading.
   description: 150–160 characters, the search snippet.
   ogTitle/ogDescription: written for a link preview card, which is read at a
   glance and truncates sooner than a search result. */
const META = {
  home: {
    path: '/',
    title: "SkillGrow — The world's first fully integrated 0–25 SEND platform",
    description: "SkillGrow builds the world's first fully integrated 0–25 SEND platform: EHCPs, safeguarding, therapy and provision mapping in one connected child record.",
    ogTitle: "SkillGrow — The world's first fully integrated 0–25 SEND platform",
    ogDescription: 'One connected platform for the whole 0–25 SEND journey. EHCPs, safeguarding, therapy, behaviour and outcomes, joined up around each child.',
  },
  sen: {
    path: '/sen',
    title: 'DARE SEN OS — SkillGrow',
    description: 'DARE SEN OS is SEN school management software: 29+ integrated apps covering EHCPs, safeguarding, therapy, medication, behaviour and outcomes in one record.',
    ogTitle: 'DARE SEN OS — every concern reaches the right adult',
    ogDescription: 'The safeguarding chain and the EHCP evidence trail in one system, built for special schools where the two are never separate. 29+ integrated apps.',
  },
  mainstream: {
    path: '/mainstream',
    title: 'DARE Mainstream — SkillGrow',
    description: 'SEND software for mainstream schools: SENCO provision mapping, EHCP review cycles, graduated-response evidence and Individual Support Plan readiness now.',
    ogTitle: 'DARE Mainstream — be ready for Individual Support Plans',
    ogDescription: 'Provision mapping, EHCP review cycles and graduated-response evidence captured in the flow of teaching — and ISP-ready before you have to be.',
  },
  'staff-pwa': {
    path: '/staff-pwa',
    title: 'Staff PWA — SkillGrow',
    description: "A SEND app for frontline staff: log observations, behaviour and care notes in seconds, work offline, and attach every entry to the child's EHCP outcomes.",
    ogTitle: 'Staff PWA — any device, any staff member, in real time',
    ogDescription: 'No licences to count and no laptops to find. Every adult who works with a child can log what just happened, offline, in seconds.',
  },
  parent: {
    path: '/parent',
    title: 'Parent Portal — SkillGrow',
    description: 'A SEND parent portal with daily diaries, plain-English EHCP progress, real-time safeguarding alerts and two-way contact with the team around your child.',
    ogTitle: 'Parent Portal — always free, for every family',
    ogDescription: 'Daily diaries, EHCP visibility, safeguarding alerts and direct contact with the team around your child. Free for every family, always.',
  },
  trust: {
    path: '/trust',
    title: 'Trust Portal — SkillGrow',
    description: 'SEND oversight for MATs and local authorities: cross-school analytics, EHCP and safeguarding visibility, and governance reporting in one live dashboard.',
    ogTitle: 'Trust Portal — one safeguarding picture, across every school',
    ogDescription: 'Live visibility of concerns, patterns and provision across the whole trust — without waiting for twelve DSLs to compile twelve returns.',
  },
  about: {
    path: '/about',
    title: 'About — SkillGrow',
    description: 'SkillGrow Technologies builds SEND software from twenty-one years of frontline SEN practice. Independent, UK-built, and designed for the whole 0–25 journey.',
    ogTitle: 'About SkillGrow — built by people who have done the job',
    ogDescription: 'Twenty-one years in SEND, twelve on the frontline. No venture capital, no private equity — built to last by the people who build it.',
  },
  contact: {
    path: '/contact',
    title: 'Contact — SkillGrow',
    description: 'Talk to the SkillGrow founding team about DARE SEN OS, EHCP management or SEND software for your school, trust or local authority — we reply within a day.',
    ogTitle: 'Contact SkillGrow — talk to the founding team',
    ogDescription: 'Every enquiry is read by a member of the founding team. No call centres, no auto-replies. We reply within one working day.',
  },
  privacy: {
    path: '/privacy',
    title: 'Privacy Policy — SkillGrow',
    description: 'How SkillGrow Technologies Ltd handles personal data: data controller details, ICO registration ZC142603, UK data residency and your rights under UK GDPR.',
    ogTitle: 'Privacy Policy — SkillGrow',
    ogDescription: 'What this site collects, our lawful basis, who processes it, how long we keep it, and your rights under UK GDPR. ICO registered: ZC142603.',
  },
  security: {
    path: '/security',
    title: 'Security — SkillGrow',
    description: 'How SkillGrow protects SEND data: UK data residency in AWS London, encryption at rest and in transit, role-based access, row-level security and daily backups.',
    ogTitle: 'Security at SkillGrow',
    ogDescription: 'UK data residency, encryption at rest and in transit, role-based access, row-level security, daily backups. ICO registered, KCSIE 2025 aligned.',
  },  pricing: {
    path: '/pricing',
    title: 'Pricing — SkillGrow',
    description: 'SkillGrow pricing: DARE SEN OS from £3,500/yr, DARE Mainstream from £2,400/yr, Trust Portal from £12,000/yr. No setup fees and no per-user charges, ever.',
    ogTitle: 'SkillGrow pricing — transparent, no surprises',
    ogDescription: 'Annual licences tiered by school size, with 25% off for three years for schools joining before April 2027. The Parent Portal is always free.',
  },
  faq: {
    path: '/faq',
    title: 'FAQ — SkillGrow',
    description: 'Answers on SkillGrow pricing and contracts, UK data storage and security, getting started with DARE, and what each product in the DARE platform actually does.',
    ogTitle: 'SkillGrow FAQ — pricing, data, setup and the platform',
    ogDescription: 'Where your data lives, how pricing works, what setup involves, and what DARE SEN OS, DARE Mainstream and the portals do.',
  },
  terms: {
    path: '/terms',
    title: 'Terms of Service — SkillGrow',
    description: 'The terms on which SkillGrow Technologies Ltd provides its SEND platform: subscriptions, acceptable use, data ownership, liability and termination.',
    ogTitle: 'Terms of Service — SkillGrow',
    ogDescription: 'Subscription and payment, acceptable use, who owns what, liability and termination. Schools own their data; governed by the law of England and Wales.',
  },
  dpa: {
    path: '/dpa',
    title: 'Data Processing Agreement — SkillGrow',
    description: 'How SkillGrow processes school data as a data processor: sub-processors, data subject rights, breach notification and deletion within 30 days of contract end.',
    ogTitle: 'Data Processing Agreement — SkillGrow',
    ogDescription: 'The school is the controller, SkillGrow the processor. Sub-processors, data subject rights, breach notification and retention, in plain English.',
  },
};

/* The values land inside HTML attributes, so a stray quote would end the
   attribute early. The copy above is ours, but escaping it keeps that true
   of whatever anyone adds later. */
function attr(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function headFor(meta) {
  const url = ORIGIN + meta.path;
  return [
    `<title>${attr(meta.title)}</title>`,
    `<meta name="description" content="${attr(meta.description)}">`,
    `<link rel="canonical" href="${url}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="SkillGrow">',
    `<meta property="og:title" content="${attr(meta.ogTitle)}">`,
    `<meta property="og:description" content="${attr(meta.ogDescription)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${OG_IMAGE}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${attr(IMAGE_ALT)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${attr(meta.ogTitle)}">`,
    `<meta name="twitter:description" content="${attr(meta.ogDescription)}">`,
    `<meta name="twitter:image" content="${OG_IMAGE}">`,
  ].join('\n');
}

const BLOCK = /<!-- META:START[\s\S]*?META:END -->/;

let shell = null;
function readShell() {
  if (shell === null) {
    shell = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  }
  return shell;
}

module.exports = function handler(req, res) {
  const slug = String((req.query && req.query.page) || '').replace(/^\/+|\/+$/g, '');
  const meta = Object.hasOwn(META, slug) ? META[slug] : null;

  if (!meta || slug === 'home') {
    /* Only reachable if vercel.json and META disagree. Send the crawler and
       the visitor to the canonical page rather than inventing tags. */
    res.statusCode = 302;
    res.setHeader('Location', ORIGIN + (meta ? meta.path : '/'));
    return res.end();
  }

  let html;
  try {
    html = readShell();
  } catch (err) {
    /* The shell was not bundled with the function. Degrade to the legacy hash
       route: the router still renders the right page, only the preview tags
       are the homepage's. Better than a 500 on every product page. */
    console.error('page: cannot read index.html —', err && err.message);
    res.statusCode = 302;
    res.setHeader('Location', `/#${meta.path}`);
    return res.end();
  }

  if (!BLOCK.test(html)) {
    /* Someone removed or renamed the marker comments in index.html. Serve the
       page unchanged rather than nothing, and make the cause findable. */
    console.error('page: META block not found in index.html — serving unmodified');
  }

  const body = html.replace(BLOCK, headFor(meta));

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.end(body);
};
