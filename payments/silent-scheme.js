// The scheme doesn't answer a debit (the sandbox's 8600 1402 0000 0009 never does): the buyer sees
// UNKNOWN, never declined, and a workflow asks the scheme again until the payment is settled.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL } from '../lib/config.js';
import { liveWebsite } from '../lib/onboarding.js';
import { serverToken, signedRequest } from '../lib/signing.js';

export const options = {
  vus: 2,
  iterations: 4,
  thresholds: { checks: ['rate>0.99'] },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const SETTLES_WITHIN_SECONDS = Number(__ENV.SETTLES_WITHIN_SECONDS || 180);

export function setup() {
  const shop = liveWebsite('silent');
  return { shop, token: serverToken(shop.client) };
}

export default function ({ shop, token }) {
  const order = `silent-${__VU}-${__ITER}-${Date.now()}`;
  const body = JSON.stringify({ salesPointId: shop.salesPointId, orderId: order, amount: 5000000, returnUrl: `${shop.site}/done` });
  const link = signedRequest('POST', '/api/v1/payments', { token, signingKey: shop.client.signingKey, body, idempotencyKey: `k-${order}` })
    .json('paymentUrl')
    .split('/pay/')[1];
  const page = `${BASE_URL}/api/v1/pay/${link}`;
  http.post(`${page}/card`, JSON.stringify({ number: '8600140200000009', expiry: '2812' }), { headers: JSON_HEADERS });
  const debit = http.post(`${page}/code`, JSON.stringify({ code: '111111' }), { headers: JSON_HEADERS, timeout: '90s', tags: { name: 'silent-debit' } });
  check(debit, { 'no answer is unknown, never declined': (r) => r.json('status') === 'UNKNOWN' });

  let status = 'UNKNOWN';
  for (let waited = 0; waited < SETTLES_WITHIN_SECONDS && status === 'UNKNOWN'; waited += 5) {
    sleep(5);
    status = http.get(page, { tags: { name: 'page' } }).json('status');
  }
  check(status, { 'the workflow settles it by asking the scheme again': (s) => s === 'PAID' });
}
