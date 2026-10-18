// A registered merchant goes through the whole lifecycle, driven by bank admins.
// Activation needs four eyes: aziz asks, malika approves.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from '../lib/config.js';
import { latestCode } from '../lib/mailpit.js';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    'http_req_duration{name:admin}': ['p(95)<200'],
    checks: ['rate>0.99'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function admin(path, adminId, body) {
  return http.post(`${BASE_URL}/api/v1/admin/partners/${path}`, body ? JSON.stringify(body) : null, {
    headers: { ...JSON_HEADERS, 'X-Admin-Id': adminId },
    tags: { name: 'admin' },
  });
}

function decide(rid, action, adminId) {
  return http.post(`${BASE_URL}/api/v1/admin/activation-requests/${rid}/${action}`, null, {
    headers: { 'X-Admin-Id': adminId },
    tags: { name: 'admin' },
  });
}

const movedTo = (status) => (r) => r.status === 200 && r.json('status') === status;

export default function () {
  const email = `life-${__VU}-${__ITER}-${Date.now()}@example.uz`;
  const id = http
    .post(`${BASE_URL}/api/v1/registrations`, JSON.stringify({ companyName: 'Aziza Shoes', email }), { headers: JSON_HEADERS })
    .json('id');

  check(admin(`${id}/verify`, 'aziz'), { 'verify waits for the email (409)': (r) => r.status === 409 && r.json('code') === 'PARTNER_EMAIL_NOT_VERIFIED' });

  http.post(`${BASE_URL}/api/v1/registrations/email-verification`, JSON.stringify({ email, code: latestCode(email) }), { headers: JSON_HEADERS });

  check(admin(`${id}/activation-requests`, 'aziz'), { 'cannot ask before approval (409)': (r) => r.status === 409 && r.json('code') === 'PARTNER_INVALID_TRANSITION' });
  check(admin(`${id}/verify`, 'aziz'), { 'verified, waiting for contract': movedTo('WAITING_CONTRACT') });
  check(admin(`${id}/contract`, 'aziz', { contractNumber: `HP-${id}` }), { 'contract approves': (r) => movedTo('APPROVED')(r) && r.json('contractNumber') === `HP-${id}` });
  const asked = admin(`${id}/activation-requests`, 'aziz');
  check(asked, { 'activation requested (201)': (r) => r.status === 201 && r.json('status') === 'PENDING' });
  check(admin(`${id}/activation-requests`, 'bekzod'), { 'one waiting request (409)': (r) => r.status === 409 && r.json('code') === 'ACTIVATION_REQUEST_PENDING' });
  const rid = asked.json('id');
  check(decide(rid, 'approve', 'aziz'), { 'no self-approval (409)': (r) => r.status === 409 && r.json('code') === 'SELF_APPROVAL' });
  check(decide(rid, 'approve', 'malika'), { 'second admin approves': (r) => r.status === 200 && r.json('status') === 'APPROVED' });
  check(http.get(`${BASE_URL}/api/v1/partners/${id}`), { active: (r) => r.json('status') === 'ACTIVE' });
  check(admin(`${id}/suspend`, 'malika', { reason: 'Chargebacks above limit' }), { suspended: movedTo('SUSPENDED') });
  check(admin(`${id}/restore`, 'malika'), { restored: movedTo('ACTIVE') });
  check(admin(`${id}/terminate`, 'malika', { reason: 'Contract ended' }), { terminated: movedTo('TERMINATED') });
  check(admin(`${id}/restore`, 'malika'), { 'terminated is final (409)': (r) => r.status === 409 });

  const history = http.get(`${BASE_URL}/api/v1/admin/partners/${id}/history`, { tags: { name: 'admin' } });
  check(history, { 'seven changes recorded': (r) => r.status === 200 && r.json().length === 7 });
}
