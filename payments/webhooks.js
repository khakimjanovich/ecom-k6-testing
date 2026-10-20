// The website takes webhooks: every finished payment is POSTed to it once it is paid or declined,
// signed the Standard Webhooks way: "v1," + base64 HMAC-SHA256 of "webhook-id.webhook-timestamp.body".
// The processing sandbox plays the merchant's endpoint; its request journal shows what arrived.
import http from 'k6/http';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';
import { check, sleep } from 'k6';
import { BASE_URL, SANDBOX_URL } from '../lib/config.js';
import { bearer } from '../lib/auth.js';
import { liveWebsite } from '../lib/onboarding.js';
import { serverToken, signedRequest } from '../lib/signing.js';

export const options = {
  vus: 3,
  iterations: 12,
  thresholds: { checks: ['rate>0.99'] },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const HOOK_PATH = '/merchant/webhooks';

export function setup() {
  const shop = liveWebsite('hook');
  const r = http.put(
    `${BASE_URL}/api/v1/partner/sales-points/${shop.salesPointId}/webhook`,
    JSON.stringify({ url: `http://processing-sandbox:8080${HOOK_PATH}` }),
    { headers: { ...JSON_HEADERS, ...bearer(shop.partner) } },
  );
  check(r, { 'the website takes webhooks': (res) => res.status === 200 && res.json('webhookUrl').endsWith(HOOK_PATH) });
  const foreign = http.put(
    `${BASE_URL}/api/v1/partner/sales-points/${shop.salesPointId}/webhook`,
    JSON.stringify({ url: 'https://attacker.example.com/hook' }),
    { headers: { ...JSON_HEADERS, ...bearer(shop.partner) } },
  );
  check(foreign, { 'a URL off the website is refused (400)': (res) => res.status === 400 });
  return { shop, token: serverToken(shop.client) };
}

/** The webhook the sandbox received for this payment, or null. */
function received(paymentId) {
  const r = http.post(
    `${SANDBOX_URL}/__admin/requests/find`,
    JSON.stringify({ method: 'POST', url: HOOK_PATH, bodyPatterns: [{ contains: paymentId }] }),
    { headers: JSON_HEADERS },
  );
  return r.json('requests')[0] ?? null;
}

export default function ({ shop, token }) {
  const order = `hook-${__VU}-${__ITER}-${Date.now()}`;
  const declined = __ITER % 2 === 1;
  const body = JSON.stringify({ salesPointId: shop.salesPointId, orderId: order, amount: 3000000, returnUrl: `${shop.site}/done` });
  const created = signedRequest('POST', '/api/v1/payments', { token, signingKey: shop.client.signingKey, body, idempotencyKey: `k-${order}` });
  const page = `${BASE_URL}/api/v1/pay/${created.json('paymentUrl').split('/pay/')[1]}`;
  const card = declined ? '8600140200000082' : '8600140234567890';
  http.post(`${page}/card`, JSON.stringify({ number: card, expiry: '2812' }), { headers: JSON_HEADERS });
  http.post(`${page}/code`, JSON.stringify({ code: '111111' }), { headers: JSON_HEADERS });

  let hook = null;
  for (let i = 0; i < 20 && !hook; i++) {
    sleep(0.5);
    hook = received(created.json('id'));
  }
  const headers = hook ? hook.headers : {};
  const text = hook ? `${headers['webhook-id']}.${headers['webhook-timestamp']}.${hook.body}` : '';
  check(hook, {
    'the merchant hears how the payment ended': (h) => h !== null && JSON.parse(h.body).status === (declined ? 'DECLINED' : 'PAID'),
    'the webhook is signed with the client key': (h) =>
      h !== null && headers['webhook-signature'] === `v1,${crypto.hmac('sha256', encoding.b64decode(shop.client.signingKey), text, 'base64')}`,
    'it names its event, so repeats can be dropped': (h) => h !== null && headers['webhook-id'] === JSON.parse(h.body).eventId,
  });
}
