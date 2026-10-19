// An admin reads one partner under load. A missing partner must answer 404 fast, never 500.
import http from 'k6/http';
import { check } from 'k6';
import { ADMIN_PASSWORD, BASE_URL } from '../lib/config.js';
import { bearer, login } from '../lib/auth.js';

export const options = {
  stages: [
    { duration: '20s', target: 20 },
    { duration: '40s', target: 20 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<100', 'p(99)<105'],
    checks: ['rate>0.99'],
  },
};

const MISSING = '00000000-0000-0000-0000-000000000000';

export function setup() {
  return login('aziz', ADMIN_PASSWORD);
}

export default function (token) {
  const res = http.get(`${BASE_URL}/api/v1/partners/${__ENV.PARTNER_ID || MISSING}`, { headers: bearer(token) });
  check(res, { 'no server errors': (r) => r.status < 500, 'admin is let in': (r) => r.status !== 401 && r.status !== 403 });
}
