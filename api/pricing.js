/* GET /api/pricing — SkillGrow's prices, from HQ's Settings → Pricing (the ONLY source; Tunde 20 Oct 2026).
 *
 * Server-side, so no visitor's browser shows or calls an HQ address (CEO ruling 2026-10-01).
 *   → 200 { products: [{ product, price, unit, note, tiers: [{ band, price }] }] }
 *   → 503 { products: null }   HQ unreachable / no prices — logged; the page keeps its built-in prices
 * Cached 5 minutes at the edge and never served stale, so a price saved in HQ is on the site within 5 minutes.
 */
const { fetchPricing, setPricingCacheHeaders } = require('./_lib/hq');

module.exports = async function handler(req, res) {
  const products = await fetchPricing();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (products === null) {
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 503;
    return res.end(JSON.stringify({ products: null }));
  }
  setPricingCacheHeaders(res);
  res.statusCode = 200;
  return res.end(JSON.stringify({ products }));
};
