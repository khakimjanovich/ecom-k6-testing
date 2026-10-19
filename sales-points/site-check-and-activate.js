// An active merchant adds websites; admins check each one, set the deal's terms and switch it on.
import http from 'k6/http';
import { check } from 'k6';
import { bearer } from '../lib/auth.js';
import { BASE_URL } from '../lib/config.js';
import { activeMerchant } from '../lib/onboarding.js';

export const options = {
  vus: 3,
  duration: '30s',
  thresholds: {
    'http_req_duration{name:sales-points}': ['p(95)<10'],
    checks: ['rate>0.99'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function setup() {
  return activeMerchant('sites');
}

function post(path, token, body) {
  return http.post(`${BASE_URL}${path}`, body ? JSON.stringify(body) : null, {
    headers: { ...JSON_HEADERS, ...bearer(token) },
    tags: { name: 'sales-points' },
  });
}

const status = (expected) => (r) => r.status === 200 && r.json('status') === expected;
const code = (status, expected) => (r) => r.status === status && r.json('code') === expected;

export default function ({ partner, aziz, malika }) {
  const site = `https://shop-${__VU}-${__ITER}-${Date.now()}.example.uz`;

  check(post('/api/v1/partner/sales-points', partner, { name: 'Shop', websiteUrl: site, returnUrls: ['https://evil.example/steal'] }), {
    'foreign return URL refused (400)': code(400, 'SALES_POINT_RETURN_URL_FOREIGN'),
  });

  const created = post('/api/v1/partner/sales-points', partner, { name: 'Shop', websiteUrl: site, returnUrls: [`${site}/done`] });
  check(created, { 'draft created (201)': (r) => r.status === 201 && r.json('status') === 'DRAFT' });
  const admin = `/api/v1/admin/sales-points/${created.json('id')}`;

  check(post(`${admin}/site-checks`, aziz, { result: 'FAILED', findings: ['No refund policy page'] }), {
    'failed check recorded (201)': (r) => r.status === 201,
  });
  http.put(`${BASE_URL}${admin}/settings`, JSON.stringify({ schemes: ['UZCARD', 'HUMO'], refundWindowDays: 14 }), {
    headers: { ...JSON_HEADERS, ...bearer(aziz) },
    tags: { name: 'sales-points' },
  });
  check(post(`${admin}/activate`, aziz), { 'no activation after a failed check (409)': code(409, 'SALES_POINT_SITE_CHECK_REQUIRED') });

  post(`${admin}/site-checks`, malika, { result: 'PASSED', findings: [] });
  check(post(`${admin}/activate`, aziz), { active: status('ACTIVE') });
  check(post(`${admin}/suspend`, malika, { reason: 'Fake reviews on the site' }), { suspended: status('SUSPENDED') });
  check(post(`${admin}/restore`, malika), { restored: status('ACTIVE') });
}
