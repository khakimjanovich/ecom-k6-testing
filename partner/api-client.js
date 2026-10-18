// An active partner creates API clients for its servers and rotates their secrets.
import http from 'k6/http';
import { check } from 'k6';
import { ADMIN_PASSWORD, BASE_URL, PARTNER_PASSWORD } from '../lib/config.js';
import { bearer, clientToken, login } from '../lib/auth.js';
import { signUp, verifyEmail } from '../lib/onboarding.js';

export const options = {
  vus: 2,
  duration: '20s',
  thresholds: {
    'http_req_duration{name:clients}': ['p(95)<500'],
    checks: ['rate>0.99'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** One merchant, taken through onboarding by two admins. */
export function setup() {
  const aziz = login('aziz', ADMIN_PASSWORD);
  const malika = login('malika', ADMIN_PASSWORD);
  const { id, email } = signUp('m2m');
  verifyEmail(email);
  const admin = (path, token, body) =>
    http.post(`${BASE_URL}/api/v1/admin/${path}`, body ? JSON.stringify(body) : null, { headers: { ...JSON_HEADERS, ...bearer(token) } });
  admin(`partners/${id}/verify`, aziz);
  admin(`partners/${id}/contract`, aziz, { contractNumber: `HP-${id}` });
  const requestId = admin(`partners/${id}/activation-requests`, aziz).json('id');
  admin(`activation-requests/${requestId}/approve`, malika);
  return login(email, PARTNER_PASSWORD);
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
