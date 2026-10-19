// Payment links: a merchant's user makes a link in the portal and sends it to a buyer in a chat; the
// buyer pays on the same bank page, with no way back to a shop. Only the owner makes links, and only
// for as long as the bank allows.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from '../lib/config.js';
import { bearer } from '../lib/auth.js';
import { liveWebsite } from '../lib/onboarding.js';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    'http_req_duration{name:create-link}': ['p(95)<90'],
    checks: ['rate>0.99'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const LINKS = `${BASE_URL}/api/v1/partner/payment-links`;

export function setup() {
  return { shop: liveWebsite('link'), other: liveWebsite('other') };
}

const create = (token, body, name = 'create-link') =>
  http.post(LINKS, JSON.stringify(body), { headers: { ...JSON_HEADERS, ...bearer(token) }, tags: { name } });

export default function ({ shop, other }) {
  const link = create(shop.partner, { salesPointId: shop.salesPointId, amount: 25000000, description: 'Red shoes, size 38', validForHours: 24 });
  check(link, { 'the merchant gets a link (201)': (r) => r.status === 201 && r.json('url').includes('/pay/') && r.json('orderId').startsWith('link-') });
  const page = `${BASE_URL}/api/v1/pay/${link.json('url').split('/pay/')[1]}`;
  check(http.get(page, { tags: { name: 'page' } }), { 'the page has no way back to a shop': (r) => r.status === 200 && !r.json('returnUrl') });
  http.post(`${page}/card`, JSON.stringify({ number: '8600140234567890', expiry: '2812' }), { headers: JSON_HEADERS, tags: { name: 'page-card' } });
  check(http.post(`${page}/code`, JSON.stringify({ code: '111111' }), { headers: JSON_HEADERS, tags: { name: 'page-code' } }), {
    'the buyer pays (PAID)': (r) => r.json('status') === 'PAID',
  });

  check(create(shop.partner, { salesPointId: other.salesPointId, amount: 100000, description: 'Not mine', validForHours: 1 }, 'refused'), {
    "another merchant's website is refused (422)": (r) => r.status === 422 && r.json('code') === 'PAYMENT_SALES_POINT_NOT_PAYABLE',
  });
  check(create(shop.partner, { salesPointId: shop.salesPointId, amount: 100000, description: 'Too long', validForHours: 24 * 8 }, 'refused'), {
    'a link longer than the bank allows is refused (422)': (r) => r.status === 422 && r.json('code') === 'PAYMENT_LINK_TOO_LONG',
  });
  if (__ITER % 20 === 0) {
    const listed = http.get(LINKS, { headers: bearer(shop.partner), tags: { name: 'list-links' } });
    check(listed, { 'the list never shows a link again': (r) => r.status === 200 && r.json().length > 0 && r.json().every((l) => !l.url) });
  }
}
