// Two admins agree on fee rules; every payment then asks for its fee, so quotes must stay fast.
import http from 'k6/http';
import { check } from 'k6';
import { ADMIN_PASSWORD, BASE_URL } from '../lib/config.js';
import { bearer, login } from '../lib/auth.js';

export const options = {
  vus: 4,
  duration: '30s',
  thresholds: {
    'http_req_duration{name:quote}': ['p(95)<10'],
    'http_req_duration{name:rules}': ['p(95)<10'],
    checks: ['rate>0.99'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function setup() {
  return { aziz: login('aziz', ADMIN_PASSWORD), malika: login('malika', ADMIN_PASSWORD) };
}

function post(path, token, body, name = 'rules') {
  return http.post(`${BASE_URL}/api/v1/admin/${path}`, body ? JSON.stringify(body) : null, {
    headers: { ...JSON_HEADERS, ...bearer(token) },
    tags: { name },
  });
}

const since = new Date(Date.now() - 60_000).toISOString();

export default function ({ aziz, malika }) {
  const partnerId = crypto.randomUUID();
  const salesPointId = crypto.randomUUID();

  const merchantRule = post('commissions', aziz, { partnerId, percent: 2, fixedFee: 0, validFrom: since });
  check(merchantRule, { 'rule proposed (202)': (r) => r.status === 202 && r.json('rule.status') === 'PROPOSED' });
  check(post(`commission-requests/${merchantRule.json('id')}/approve`, aziz), {
    'no self-approval (409)': (r) => r.status === 409 && r.json('code') === 'SELF_APPROVAL',
  });
  check(post(`commission-requests/${merchantRule.json('id')}/approve`, malika), { 'second admin approves': (r) => r.status === 200 });

  const overlap = post('commissions', aziz, { partnerId, percent: 3, fixedFee: 0, validFrom: since });
  check(post(`commission-requests/${overlap.json('id')}/approve`, malika), {
    'overlapping rule refused (409)': (r) => r.status === 409 && r.json('code') === 'COMMISSION_OVERLAP',
  });

  const pointRule = post('commissions', malika, { partnerId, salesPointId, percent: 1, fixedFee: 100, validFrom: since });
  post(`commission-requests/${pointRule.json('id')}/approve`, aziz);

  for (let i = 0; i < 10; i++) {
    const quote = post('commissions/quote', aziz, { partnerId, salesPointId, scheme: 'UZCARD', amount: 1_000_000 }, 'quote');
    check(quote, { 'sales point rule wins: 1% + 100': (r) => r.status === 200 && r.json('fee') === 10_100 && r.json('net') === 989_900 });
  }
  check(post('commissions/quote', aziz, { partnerId, salesPointId, scheme: 'HUMO', amount: 100 }, 'quote'), {
    'fee taking everything refused (422)': (r) => r.status === 422 && r.json('code') === 'COMMISSION_FEE_TOO_HIGH',
  });
}
