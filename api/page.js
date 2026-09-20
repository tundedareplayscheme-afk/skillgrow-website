/* GET /api/page?page=<slug> — serves index.html with that page's head.
 *
 * Why this exists: the site is one index.html rendered by a client-side
 * router, and Facebook, LinkedIn and WhatsApp do not run JavaScript. Without
 * this, every shared link would preview as the homepage, whichever page was
 * shared, and every page would carry the same meta description.
 *
 * vercel.json rewrites the eighteen non-home routes here, plus every
 * /blog/<slug> article (a second pattern, since a :page segment cannot
 * contain a slash). '/' is NOT routed here:
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
const { fetchPost } = require('../lib/hq');

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
    description: 'A personal workspace for every member of staff — clock in and out, CPD log, personal notifications, on any device.',
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
  team: {
    path: '/team',
    title: 'Our Team — SkillGrow',
    description: 'Meet the SkillGrow team: founder and CEO Tunde Alabi, with 21 years working directly with children with SEND, COO Hansa Tunde-Alabi, and our business development managers.',
    ogTitle: 'The people behind SkillGrow',
    ogDescription: 'A small team led by 21 years of frontline SEND experience, working directly with every school we support.',
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
  accessibility: {
    path: '/accessibility',
    title: 'Accessibility Statement — SkillGrow',
    description: 'Accessibility statement for www.skillgrow.co.uk: we aim to meet WCAG 2.2 Level AA. Known issues, and how to tell us about a problem with the site.',
    ogTitle: 'Accessibility Statement — SkillGrow',
    ogDescription: 'We aim to meet WCAG 2.2 Level AA. What we know is not yet right, and how to tell us if something on the site does not work for you.',
  },
  integrations: {
    path: '/integrations',
    title: 'Integrations — SkillGrow',
    description: 'How SkillGrow connects to your school: SIMS, Arbor, Bromcom and iSAMS via Wonde, Microsoft 365 sign-in, safeguarding data migration, and UK hosting on AWS.',
    ogTitle: 'SkillGrow integrations — works with what your school uses',
    ogDescription: 'MIS import via Wonde, Microsoft 365 sign-in, CPOMS and My Concern records migrated by our team, UK hosting. Don’t see yours? We build on request.',
  },
  implementation: {
    path: '/implementation',
    title: 'Implementation — SkillGrow',
    description: 'Getting started with SkillGrow: live in two weeks, staff training and support, data migration from your MIS and safeguarding system, and our SLA targets.',
    ogTitle: 'Up and running in days, not months',
    ogDescription: 'Sign-up to live in two weeks. Live staff training, role-specific guides, data migration, a 99.9% uptime target and a 1-hour response to P1 issues.',
  },
  blog: {
    path: '/blog',
    title: 'SEND Insights — SkillGrow',
    description: 'Practical SEND guidance for school leaders, SENCOs and trust leads: SEND reform, Individual Support Plans, the graduated approach, EHCPs and SENCO workload.',
    ogTitle: 'SEND Insights from SkillGrow',
    ogDescription: 'Practical guidance for school leaders, SENCOs, and trust leads navigating the SEND landscape.',
  },
  'blog/isps-what-every-senco-needs-to-know': {
    path: '/blog/isps-what-every-senco-needs-to-know',
    title: 'ISPs are coming: what every SENCO needs to know — SkillGrow',
    description: 'Individual Support Plans are set to become a legal duty for every child on Targeted or Specialist support, with the new law expected from September 2029.',
    ogTitle: 'ISPs are coming: what every SENCO needs to know before September 2029',
    ogDescription: 'What the 2026 SEND reforms mean for Individual Support Plans, when the new duty is expected, and five things schools can do to prepare now.',
  },
  'blog/graduated-approach-practical-guide': {
    path: '/blog/graduated-approach-practical-guide',
    title: 'The graduated approach: a practical guide — SkillGrow',
    description: 'A practical guide to the graduated approach: assess, plan, do, review, the evidence an EHC needs assessment request needs, and where schools most often go wrong.',
    ogTitle: 'The graduated approach: from first concern to EHCP',
    ogDescription: 'Each stage of assess, plan, do, review, the evidence you need for an EHC needs assessment request, and the common mistakes to avoid.',
  },
  'blog/senco-admin-burden': {
    path: '/blog/senco-admin-burden',
    title: 'Why your SENCO is spending most of their time on admin — SkillGrow',
    description: 'Nearly three in four SENCOs say administration takes up most of their SENCO time. What the national surveys show, and practical ways to give that time back.',
    ogTitle: 'Why your SENCO is spending most of their time on admin',
    ogDescription: 'What the National SENCO Workload Survey found, where the admin comes from, and six practical ways school leaders can fix it.',
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
  const image = meta.image || OG_IMAGE;
  const ownImage = image === OG_IMAGE;
  const tags = [
    `<title>${attr(meta.title)}</title>`,
    `<meta name="description" content="${attr(meta.description)}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="${attr(meta.type || 'website')}">`,
    '<meta property="og:site_name" content="SkillGrow">',
    `<meta property="og:title" content="${attr(meta.ogTitle)}">`,
    `<meta property="og:description" content="${attr(meta.ogDescription)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${attr(image)}">`,
  ];
  /* Declaring dimensions we have not measured would make every card with a
     Content Hub image render at the wrong aspect ratio, so they are omitted
     unless the image is the one we ship. */
  if (ownImage) {
    tags.push('<meta property="og:image:width" content="1200">');
    tags.push('<meta property="og:image:height" content="630">');
  }
  tags.push(`<meta property="og:image:alt" content="${attr(meta.imageAlt || IMAGE_ALT)}">`);
  tags.push('<meta name="twitter:card" content="summary_large_image">');
  tags.push(`<meta name="twitter:title" content="${attr(meta.ogTitle)}">`);
  tags.push(`<meta name="twitter:description" content="${attr(meta.ogDescription)}">`);
  tags.push(`<meta name="twitter:image" content="${attr(image)}">`);
  return tags.join('\n');
}

/* Search snippets truncate near 160 characters and link-preview cards sooner.
   The Content Hub's excerpt is plain text of no guaranteed length, so it is
   trimmed on a whole character rather than shipped at whatever length it is. */
function clamp(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}\u2026` : s;
}

/* Build the same shape as a META entry from a Content Hub post, so a post
   written in HQ this morning gets the tags a hand-written entry would. */
function metaForPost(post) {
  const title = String(post.title || '').trim();
  return {
    path: `/blog/${post.slug}`,
    title: `${title} \u2014 SkillGrow`,
    description: clamp(post.excerpt, 160),
    ogTitle: title,
    ogDescription: clamp(post.excerpt, 200),
    image: post.image_url || null,
    imageAlt: title,
    type: 'article',
  };
}

const BLOCK = /<!-- META:START[\s\S]*?META:END -->/;

let shell = null;
function readShell() {
  if (shell === null) {
    shell = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  }
  return shell;
}

/* A slug that is neither in META nor known to HQ is a real 404, not a
   redirect to the homepage: sending a crawler to '/' for a post that does not
   exist teaches it that every bad blog URL is the homepage. The shell is still
   served so the visitor gets the site's own styled 404 page. */
function notFound(res) {
  let html;
  try {
    html = readShell();
  } catch (err) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Not found');
  }
  const head = [
    '<title>Page not found \u2014 SkillGrow</title>',
    '<meta name="robots" content="noindex">',
  ].join('\n');
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60');
  return res.end(html.replace(BLOCK, head));
}

module.exports = async function handler(req, res) {
  const slug = String((req.query && req.query.page) || '').replace(/^\/+|\/+$/g, '');
  let meta = Object.hasOwn(META, slug) ? META[slug] : null;

  /* vercel.json now sends EVERY /blog/<slug> here, not just the three spelled
     out in META, so that a post published in HQ needs no code change. The
     three static entries stay: they are the site's own articles and must keep
     working when HQ is unreachable. */
  if (!meta && /^blog\/.+/.test(slug)) {
    const post = await fetchPost(slug.slice('blog/'.length));
    if (!post) return notFound(res);
    meta = metaForPost(post);
  }

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
