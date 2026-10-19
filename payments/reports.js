// Daily reports: the merchant lists its business days and downloads the CSV behind one. Today's
// CSV is read straight from the payments, so a payment made now is in it.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from '../lib/config.js';
import { bearer } from '../lib/auth.js';
import { liveWebsite } from '../lib/onboarding.js';
import { serverToken, signedRequest } from '../lib/signing.js';

export const options = {
  vus: 3,
  duration: '20s',
  thresholds: {
    'http_req_duration{name:report-csv}': ['p(95)<90'],
    checks: ['rate>0.99'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };
// The business day in the settlement time zone (Asia/Tashkent, UTC+5, no daylight saving).
const today = () => new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);

export function setup() {
  const shop = liveWebsite('report');
  return { shop, token: serverToken(shop.client) };
}

export default function ({ shop, token }) {
  const order = `rep-${__VU}-${__ITER}-${Date.now()}`;
  const body = JSON.stringify({ salesPointId: shop.salesPointId, orderId: order, amount: 2500000, returnUrl: `${shop.site}/done` });
  const created = signedRequest('POST', '/api/v1/payments', { token, signingKey: shop.client.signingKey, body, idempotencyKey: `k-${order}` });
  const page = `${BASE_URL}/api/v1/pay/${created.json('paymentUrl').split('/pay/')[1]}`;
  http.post(`${page}/card`, JSON.stringify({ number: '8600140234567890', expiry: '2812' }), { headers: JSON_HEADERS });
  http.post(`${page}/code`, JSON.stringify({ code: '111111' }), { headers: JSON_HEADERS });

  const csv = http.get(`${BASE_URL}/api/v1/partner/reports/${today()}/payments.csv`, { headers: bearer(shop.partner), tags: { name: 'report-csv' } });
  check(csv, {
    "today's CSV lists the payment": (r) => r.status === 200 && r.body.startsWith('kind,payment_id') && r.body.includes(`"PAYMENT","${created.json('id')}"`),
  });
  check(http.get(`${BASE_URL}/api/v1/partner/reports`, { headers: bearer(shop.partner), tags: { name: 'reports' } }), {
    'the reports list answers': (r) => r.status === 200 && Array.isArray(r.json()),
  });
}
