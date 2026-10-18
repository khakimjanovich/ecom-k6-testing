// Admins register the terminals the processing center issued; each website and card has one live route.
import http from 'k6/http';
import { check } from 'k6';
import { bearer } from '../lib/auth.js';
import { BASE_URL } from '../lib/config.js';
import { activeMerchant } from '../lib/onboarding.js';

const VUS = 3;

export const options = {
  vus: VUS,
  duration: '30s',
  thresholds: {
    'http_req_duration{name:terminals}': ['p(95)<200'],
    checks: ['rate>0.99'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function call(method, path, token, body) {
  return http.request(method, `${BASE_URL}${path}`, body ? JSON.stringify(body) : null, {
    headers: { ...JSON_HEADERS, ...bearer(token) },
    tags: { name: 'terminals' },
  });
}

/** One website per virtual user, accepting both cards, so routes don't collide between users. */
export function setup() {
  const merchant = activeMerchant('terminals');
  const websites = [];
  for (let i = 0; i < VUS; i++) {
    const site = `https://terminals-${i}-${Date.now()}.example.uz`;
    const id = call('POST', '/api/v1/partner/sales-points', merchant.partner, { name: `Shop ${i}`, websiteUrl: site, returnUrls: [`${site}/done`] }).json('id');
    call('PUT', `/api/v1/admin/sales-points/${id}/settings`, merchant.aziz, { schemes: ['UZCARD', 'HUMO'], refundWindowDays: 14 });
    websites.push(id);
  }
  return { ...merchant, websites };
}

const mid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 15);

export default function ({ aziz, malika, websites }) {
  const site = `/api/v1/admin/sales-points/${websites[__VU - 1]}`;
  const credentials = { scheme: 'UZCARD', merchantId: mid(), terminalId: 'T1' };

  const registered = call('POST', `${site}/terminals`, aziz, credentials);
  check(registered, { 'terminal registered (201)': (r) => r.status === 201 && r.json('status') === 'ACTIVE' });
  check(call('POST', `${site}/terminals`, aziz, { ...credentials, merchantId: mid() }), {
    'one live route (409)': (r) => r.status === 409 && r.json('code') === 'TERMINAL_ROUTE_TAKEN',
  });
  check(call('GET', `${site}/terminals/route?scheme=UZCARD`, aziz), { 'payments route to it': (r) => r.status === 200 && r.json('id') === registered.json('id') });

  const terminal = `/api/v1/admin/terminals/${registered.json('id')}`;
  check(call('POST', `${terminal}/suspend`, malika, { reason: 'Processing center maintenance' }), { suspended: (r) => r.json('status') === 'SUSPENDED' });
  check(call('GET', `${site}/terminals/route?scheme=UZCARD`, aziz), { 'no route while suspended (404)': (r) => r.status === 404 && r.json('code') === 'TERMINAL_NO_ROUTE' });
  check(call('POST', `${terminal}/resume`, malika), { resumed: (r) => r.json('status') === 'ACTIVE' });
  check(call('POST', `${terminal}/revoke`, aziz, { reason: 'Replaced' }), { revoked: (r) => r.json('status') === 'REVOKED' });
  check(call('POST', `${site}/terminals`, aziz, credentials), { 'MID/TID issued once (409)': (r) => r.status === 409 && r.json('code') === 'TERMINAL_DUPLICATE' });
  check(call('GET', `${terminal}/audit`, aziz), { 'four audit entries': (r) => r.status === 200 && r.json().length === 4 });
}
