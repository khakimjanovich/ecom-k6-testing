// An active partner creates API clients for its servers and rotates their secrets.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from '../lib/config.js';
import { bearer, clientToken } from '../lib/auth.js';
import { activeMerchant } from '../lib/onboarding.js';

export const options = {
  vus: 2,
  duration: '20s',
  thresholds: {
    'http_req_duration{name:clients}': ['p(95)<15'],
    checks: ['rate>0.99'],
  },
};

/** One merchant, taken through onboarding by two admins. */
export function setup() {
  return activeMerchant('m2m').partner;
}

export default function (partner) {
  const created = http.post(`${BASE_URL}/api/v1/partner/clients`, null, { headers: bearer(partner), tags: { name: 'clients' } });
  check(created, { 'client created (201)': (r) => r.status === 201 && r.json('clientSecret') !== '' });
  const { clientId, clientSecret } = created.json();

  check(clientToken(clientId, clientSecret), { 'secret logs in': (r) => r.status === 200 });

  const rotated = http.post(`${BASE_URL}/api/v1/partner/clients/${clientId}/secret`, null, { headers: bearer(partner), tags: { name: 'clients' } });
  check(rotated, { 'secret rotated (200)': (r) => r.status === 200 });

  check(clientToken(clientId, clientSecret), { 'old secret refused': (r) => r.status === 401 });
  check(clientToken(clientId, rotated.json('clientSecret')), { 'new secret logs in': (r) => r.status === 200 });
}
