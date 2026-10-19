// A website's limits, set by the bank: one payment above the limit is refused when it is created,
// and buyers paying at the same time never take the website past its daily limit; the debits that
// don't fit fail before any money moves.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from '../lib/config.js';
import { bearer } from '../lib/auth.js';
import { liveWebsite } from '../lib/onboarding.js';
import { serverToken, signedRequest } from '../lib/signing.js';

const AMOUNT = 2000000; // 20 000 so'm
const MAX_PAYMENT = 5000000;
const DAILY_LIMIT = 10000000; // room for exactly five payments

export const options = {
  vus: 5,
  iterations: 20,
  thresholds: { checks: ['rate>0.99'] },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const today = () => new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);

export function setup() {
  const shop = liveWebsite('limit');
  const settings = http.put(
    `${BASE_URL}/api/v1/admin/sales-points/${shop.salesPointId}/settings`,
    JSON.stringify({ schemes: ['UZCARD', 'HUMO'], refundWindowDays: 14, maxPaymentAmount: MAX_PAYMENT, dailyLimit: DAILY_LIMIT }),
    { headers: { ...JSON_HEADERS, ...bearer(shop.aziz) } },
  );
  check(settings, { 'the bank sets the limits': (r) => r.status === 200 && r.json('dailyLimit') === DAILY_LIMIT });
  return { shop, token: serverToken(shop.client) };
}

const create = ({ shop, token }, amount) => {
  const order = `lim-${__VU}-${__ITER}-${Date.now()}-${amount}`;
  const body = JSON.stringify({ salesPointId: shop.salesPointId, orderId: order, amount, returnUrl: `${shop.site}/done` });
  return signedRequest('POST', '/api/v1/payments', { token, signingKey: shop.client.signingKey, body, idempotencyKey: `k-${order}` });
};

export default function (data) {
  if (__ITER === 0) {
    check(create(data, MAX_PAYMENT + 1), { 'one payment over the limit is refused (422)': (r) => r.status === 422 && r.json('code') === 'PAYMENT_AMOUNT_OVER_LIMIT' });
  }
  const page = `${BASE_URL}/api/v1/pay/${create(data, AMOUNT).json('paymentUrl').split('/pay/')[1]}`;
  http.post(`${page}/card`, JSON.stringify({ number: '8600140234567890', expiry: '2812' }), { headers: JSON_HEADERS });
  const paid = http.post(`${page}/code`, JSON.stringify({ code: '111111' }), { headers: JSON_HEADERS });
  check(paid, { 'paid, or stopped by the limit with no money taken': (r) => r.json('status') === 'PAID' || r.json('status') === 'FAILED' });
}

export function teardown({ shop }) {
  const csv = http.get(`${BASE_URL}/api/v1/partner/reports/${today()}/payments.csv`, { headers: bearer(shop.partner) });
  const taken = csv.body
    .split('\n')
    .filter((line) => line.startsWith('"PAYMENT"'))
    .reduce((sum, line) => sum + Number(line.split(',')[4].replaceAll('"', '')), 0);
  check(taken, { 'the day takes exactly up to its limit, never past it': (sum) => sum === DAILY_LIMIT });
}
