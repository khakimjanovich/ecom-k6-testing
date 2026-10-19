// The buyer pays on the bank's page: the card, then the one-time code from the scheme, and the debit.
// Wrong codes are counted until the page closes; a declined card stays declined. The link's token is
// the only credential.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from '../lib/config.js';
import { liveWebsite } from '../lib/onboarding.js';
import { serverToken, signedRequest } from '../lib/signing.js';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    'http_req_duration{name:page}': ['p(95)<90'],
    'http_req_duration{name:page-card}': ['p(95)<115'],
    'http_req_duration{name:page-code}': ['p(95)<120'],
    checks: ['rate>0.99'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Accept-Language': 'en' };

export function setup() {
  const shop = liveWebsite('page');
  return { shop, token: serverToken(shop.client) };
}

/** A new payment and its page token (the last part of the link the merchant sends the buyer). */
function newPage({ shop, token }, order = undefined) {
  order = order ?? `${__VU}-${__ITER}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const body = JSON.stringify({ salesPointId: shop.salesPointId, orderId: order, amount: 15000000, returnUrl: `${shop.site}/done` });
  const created = signedRequest('POST', '/api/v1/payments', { token, signingKey: shop.client.signingKey, body, idempotencyKey: `key-${order}`, name: 'create-payment' });
  return { token: created.json('paymentUrl').split('/pay/')[1], id: created.json('id') };
}

const pay = (method, token, step, body, name) =>
  http.request(method, `${BASE_URL}/api/v1/pay/${token}${step}`, body ? JSON.stringify(body) : null, { headers: JSON_HEADERS, tags: { name } });

export default function (data) {
  const { token, id } = newPage(data);
  check(pay('GET', token, '', null, 'page'), {
    'the page opens (200)': (r) => r.status === 200 && r.json('status') === 'CREATED' && r.json('cardAttemptsLeft') === 3,
  });
  check(pay('POST', token, '/card', { number: '8600140234567890', expiry: '2812' }, 'page-card'), {
    'a code goes to the cardholder': (r) => r.status === 200 && r.json('status') === 'AWAITING_CODE' && r.json('cardBank') === 'Asaka Bank',
  });
  check(pay('POST', token, '/code', { code: '111111' }, 'page-code'), {
    'the right code pays (PAID, with the RRN)': (r) => r.status === 200 && r.json('status') === 'PAID' && !!r.json('rrn'),
  });
  check(signedRequest('GET', `/api/v1/payments/${id}`, { token: data.token, signingKey: data.shop.client.signingKey, name: 'get-payment' }), {
    'the merchant sees the fee fixed at the debit': (r) => r.json('status') === 'PAID' && r.json('fee') === 150000 && r.json('net') === 14850000,
  });

  const poor = newPage(data).token;
  pay('POST', poor, '/card', { number: '8600140200000082', expiry: '2812' }, 'page-card');
  check(pay('POST', poor, '/code', { code: '111111' }, 'page-code'), {
    'a declined card stays declined, with why': (r) => r.status === 200 && r.json('status') === 'DECLINED' && r.json('declineCode') === 'CARD_INSUFFICIENT_FUNDS',
  });

  const wrong = newPage(data).token;
  pay('POST', wrong, '/card', { number: '8600140234567890', expiry: '2812' }, 'page-card');
  const tries = [1, 2, 3].map(() => pay('POST', wrong, '/code', { code: '000000' }, 'page-code'));
  check(tries[2], { 'the last wrong code closes the page (422)': (r) => r.status === 422 && r.json('code') === 'PAYMENT_CODE_ATTEMPTS_EXHAUSTED' });
  check(pay('GET', wrong, '', null, 'page'), { 'a closed page stays closed': (r) => r.json('status') === 'FAILED' });
  check(pay('GET', 'x'.repeat(43), '', null, 'page'), { 'an unknown link (404)': (r) => r.status === 404 && r.json('code') === 'PAYMENT_PAGE_NOT_FOUND' });
}
