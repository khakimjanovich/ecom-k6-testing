// A merchant's server creates payments with signed requests: retries are idempotent, replays and
// forgeries are refused, and only its own live website can take payments.
import { check } from 'k6';
import { liveWebsite } from '../lib/onboarding.js';
import { nonce, serverToken, signedRequest } from '../lib/signing.js';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    'http_req_duration{name:create-payment}': ['p(95)<50'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  const shop = liveWebsite('payments');
  return { shop, token: serverToken(shop.client) };
}

export default function ({ shop, token }) {
  const order = `${__VU}-${__ITER}-${Date.now()}`;
  const body = JSON.stringify({ salesPointId: shop.salesPointId, orderId: order, amount: 15000000, returnUrl: `${shop.site}/done` });
  const signingKey = shop.client.signingKey;
  const create = (extra) => signedRequest('POST', '/api/v1/payments', { token, signingKey, body, idempotencyKey: `key-${order}`, name: 'create-payment', ...extra });

  const n = nonce();
  const first = create({ nonceValue: n });
  check(first, { 'payment created (201)': (r) => r.status === 201 && r.json('status') === 'CREATED' && r.json('paymentUrl') !== undefined });
  check(create(), {
    'a retry gets the same payment': (r) => r.status === 201 && r.json('id') === first.json('id') && r.headers['Idempotent-Replayed'] === 'true',
  });
  check(create({ nonceValue: n }), { 'a replay is refused (401)': (r) => r.status === 401 && r.json('code') === 'PAYMENT_NONCE_REUSED' });
  check(create({ timestamp: String(Math.floor(Date.now() / 1000) - 600) }), {
    'an old request is refused (401)': (r) => r.status === 401 && r.json('code') === 'PAYMENT_TIMESTAMP_OUT_OF_WINDOW',
  });
  check(signedRequest('POST', '/api/v1/payments', { token, signingKey: 'eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg=', body, idempotencyKey: `forged-${order}`, name: 'create-payment' }), {
    'a forged signature is refused (401)': (r) => r.status === 401 && r.json('code') === 'PAYMENT_SIGNATURE_INVALID',
  });
  const changed = JSON.stringify({ salesPointId: shop.salesPointId, orderId: order, amount: 100, returnUrl: `${shop.site}/done` });
  check(create({ body: changed }), { 'a reused key with another body is refused (422)': (r) => r.status === 422 && r.json('code') === 'PAYMENT_IDEMPOTENCY_KEY_REUSED' });
  check(signedRequest('GET', `/api/v1/payments/${first.json('id')}`, { token, signingKey, name: 'get-payment' }), {
    'the merchant reads it back': (r) => r.status === 200 && r.json('orderId') === order && !r.json('paymentUrl'),
  });
}
