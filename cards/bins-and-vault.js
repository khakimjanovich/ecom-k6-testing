// The BIN registry answers which scheme a card belongs to; the vault never gives a card number back.
// Binding a card needs the hosted payment page, so it is covered by the card module's integration tests.
import http from 'k6/http';
import { check } from 'k6';
import { bearer, login } from '../lib/auth.js';
import { ADMIN_PASSWORD, BASE_URL } from '../lib/config.js';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    'http_req_duration{name:bin-lookup}': ['p(95)<100'],
    checks: ['rate>0.99'],
  },
};

function call(method, path, token, body, name = 'cards', language = 'en') {
  return http.request(method, `${BASE_URL}${path}`, body ? JSON.stringify(body) : null, {
    headers: { 'Content-Type': 'application/json', 'Accept-Language': language, ...bearer(token) },
    tags: { name },
  });
}

export function setup() {
  const aziz = login('aziz', ADMIN_PASSWORD);
  const synced = call('POST', '/api/v1/admin/bins/sync', aziz);
  check(synced, { 'both schemes synced': (r) => r.status === 200 && r.json().every((s) => s.updated && s.ranges > 0) });
  return { aziz };
}

export default function ({ aziz }) {
  const lookup = (digits) => call('GET', `/api/v1/admin/bins/lookup?digits=${digits}`, aziz, null, 'bin-lookup');
  check(lookup('86001402'), { 'Uzcard by BIN': (r) => r.status === 200 && r.json('scheme') === 'UZCARD' });
  check(lookup('98600901'), { 'Humo by BIN': (r) => r.status === 200 && r.json('scheme') === 'HUMO' });
  check(lookup('41111111'), { 'unknown BIN (404)': (r) => r.status === 404 && r.json('code') === 'CARD_BIN_NOT_FOUND' });

  check(call('POST', '/api/v1/admin/cards/search', aziz, { number: '8600140200000033' }, 'cards', 'ru'), {
    'no such card, in Russian (404)': (r) => r.status === 404 && r.json('code') === 'CARD_NOT_FOUND' && r.json('detail') === 'Такой карты нет.',
  });
  check(call('POST', '/api/v1/admin/cards/search', aziz, { number: '8600-1402' }), { 'a number is 16 digits (400)': (r) => r.status === 400 });
  check(call('GET', '/api/v1/admin/bins', ''), { 'admins only (401)': (r) => r.status === 401 });
}
