// Episode 03: read one partner under load. A missing partner must answer 404 fast, never 500.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from '../lib/config.js';

export const options = {
  stages: [
    { duration: '20s', target: 20 },
    { duration: '40s', target: 20 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<150', 'p(99)<300'],
    checks: ['rate>0.99'],
  },
};

const MISSING = '00000000-0000-0000-0000-000000000000';

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/partners/${__ENV.PARTNER_ID || MISSING}`);
  check(res, { 'no server errors': (r) => r.status < 500 });
}
