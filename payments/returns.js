// Giving money back: the whole payment, by the merchant's server (signed) or from the portal for a
// payment link. On the day it was paid it is reversed before settlement; it goes back only once.
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
    'http_req_duration{name:give-back}': ['p(95)<105'],
    checks: ['rate>0.99'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const CARDS = [
  { number: '8600140234567890', expiry: '2812', code: '111111' },
  { number: '9860090101191238', expiry: '2804', code: '660130' },
];

export function setup() {
  const shop = liveWebsite('return');
  return { shop, token: serverToken(shop.client) };
}

function pay(link, card) {
  const page = `${BASE_URL}/api/v1/pay/${link.split('/pay/')[1]}`;
  http.post(`${page}/card`, JSON.stringify({ number: card.number, expiry: card.expiry }), { headers: JSON_HEADERS });
  return http.post(`${page}/code`, JSON.stringify({ code: card.code }), { headers: JSON_HEADERS }).json('status');
}

export default function ({ shop, token }) {
  const card = CARDS[__ITER % 2];
  const order = `ret-${__VU}-${__ITER}-${Date.now()}`;
  const body = JSON.stringify({ salesPointId: shop.salesPointId, orderId: order, amount: 4000000, returnUrl: `${shop.site}/done` });
  const created = signedRequest('POST', '/api/v1/payments', { token, signingKey: shop.client.signingKey, body, idempotencyKey: `k-${order}` });
  const id = created.json('id');
  const refund = () => signedRequest('POST', `/api/v1/payments/${id}/refund`, { token, signingKey: shop.client.signingKey, name: 'give-back' });

  check(refund(), { 'an unpaid payment is not given back (422)': (r) => r.status === 422 && r.json('code') === 'PAYMENT_NOT_PAID' });
  pay(created.json('paymentUrl'), card);
  check(refund(), { 'paid today: reversed': (r) => r.status === 200 && r.json('status') === 'REVERSED' && !!r.json('returnedAt') });
  check(refund(), { 'only once (409)': (r) => r.status === 409 && r.json('code') === 'PAYMENT_ALREADY_RETURNED' });

  if (__ITER % 5 === 0) {
    const link = http.post(
      `${BASE_URL}/api/v1/partner/payment-links`,
      JSON.stringify({ salesPointId: shop.salesPointId, amount: 1500000, description: 'Gift card', validForHours: 1 }),
      { headers: { ...JSON_HEADERS, ...bearer(shop.partner) } },
    );
    pay(link.json('url'), card);
    const back = http.post(`${BASE_URL}/api/v1/partner/payment-links/${link.json('id')}/refund`, null, { headers: bearer(shop.partner) });
    check(back, { 'a paid link is given back from the portal': (r) => r.status === 200 && r.json('status') === 'REVERSED' });
  }
}
