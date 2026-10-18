// Signs a merchant up and verifies its email; returns its id and email.
import http from 'k6/http';
import { BASE_URL, PARTNER_PASSWORD } from './config.js';
import { latestCode } from './mailpit.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function signUp(prefix) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@example.uz`;
  const id = http
    .post(`${BASE_URL}/api/v1/registrations`, JSON.stringify({ companyName: 'Aziza Shoes', email, password: PARTNER_PASSWORD }), {
      headers: JSON_HEADERS,
      tags: { name: 'register' },
    })
    .json('id');
  return { id, email };
}

export function verifyEmail(email) {
  return http.post(`${BASE_URL}/api/v1/registrations/email-verification`, JSON.stringify({ email, code: latestCode(email) }), {
    headers: JSON_HEADERS,
    tags: { name: 'verify' },
  });
}
