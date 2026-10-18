// A merchant registers, reads the code from their inbox, and verifies the email.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, PARTNER_PASSWORD } from '../lib/config.js';
import { latestCode } from '../lib/mailpit.js';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    'http_req_duration{name:register}': ['p(95)<300'],
    'http_req_duration{name:verify}': ['p(95)<300'],
    checks: ['rate>0.99'],
  },
};

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };

export default function () {
  const email = `shop-${__VU}-${__ITER}-${Date.now()}@example.uz`;

  const registered = http.post(
    `${BASE_URL}/api/v1/registrations`,
    JSON.stringify({ companyName: 'Aziza Shoes', email, password: PARTNER_PASSWORD }),
    { ...JSON_HEADERS, tags: { name: 'register' } },
  );
  check(registered, { 'registered (201)': (r) => r.status === 201 });

  const code = latestCode(email);
  check(code, { 'code arrived by email': (c) => c !== null });

  const verified = http.post(
    `${BASE_URL}/api/v1/registrations/email-verification`,
    JSON.stringify({ email, code }),
    { ...JSON_HEADERS, tags: { name: 'verify' } },
  );
  check(verified, { 'email verified (200)': (r) => r.status === 200 && r.json('emailVerified') === true });
}
