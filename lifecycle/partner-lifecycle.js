// A registered merchant goes through the whole lifecycle, driven by bank admins.
// Activation needs four eyes: aziz asks, malika approves. Each admin is known from their Keycloak token.
import http from 'k6/http';
import { check } from 'k6';
import { ADMIN_PASSWORD, BASE_URL, PARTNER_PASSWORD } from '../lib/config.js';
import { bearer, login } from '../lib/auth.js';
import { signUp, uploadDocument, verifyEmail } from '../lib/onboarding.js';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    'http_req_duration{name:admin}': ['p(95)<15'],
    checks: ['rate>0.99'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function setup() {
  return { aziz: login('aziz', ADMIN_PASSWORD), malika: login('malika', ADMIN_PASSWORD) };
}

let tokens;

function admin(path, adminId, body) {
  return http.post(`${BASE_URL}/api/v1/admin/partners/${path}`, body ? JSON.stringify(body) : null, {
    headers: { ...JSON_HEADERS, ...bearer(tokens[adminId]) },
    tags: { name: 'admin' },
  });
}

function decide(rid, action, adminId) {
  return http.post(`${BASE_URL}/api/v1/admin/activation-requests/${rid}/${action}`, null, {
    headers: bearer(tokens[adminId]),
    tags: { name: 'admin' },
  });
}

const movedTo = (status) => (r) => r.status === 200 && r.json('status') === status;

export default function (adminTokens) {
  tokens = adminTokens;
  const { id, email } = signUp('life');

  check(admin(`${id}/verify`, 'aziz'), { 'verify waits for the email (409)': (r) => r.status === 409 && r.json('code') === 'PARTNER_EMAIL_NOT_VERIFIED' });

  verifyEmail(email);

  check(admin(`${id}/activation-requests`, 'aziz'), { 'cannot ask before approval (409)': (r) => r.status === 409 && r.json('code') === 'PARTNER_INVALID_TRANSITION' });
  check(admin(`${id}/verify`, 'aziz'), { 'no approval before KYB (409)': (r) => r.status === 409 && r.json('code') === 'PARTNER_KYB_INCOMPLETE' });
  const partner = login(email, PARTNER_PASSWORD);
  for (const type of ['CHARTER', 'PASSPORT']) {
    const uploaded = uploadDocument(partner, type);
    check(uploaded, { 'document uploaded (201)': (r) => r.status === 201 && r.json('status') === 'UPLOADED' && r.json('contentType') === 'application/pdf' });
    check(admin(`${id}/documents/${uploaded.json('id')}/verify`, 'malika'), { 'document verified': movedTo('VERIFIED') });
  }
  check(admin(`${id}/verify`, 'aziz'), { 'verified, waiting for contract': movedTo('WAITING_CONTRACT') });
  check(admin(`${id}/contract`, 'aziz', { contractNumber: `HP-${id}` }), { 'contract approves': (r) => movedTo('APPROVED')(r) && r.json('contractNumber') === `HP-${id}` });
  const asked = admin(`${id}/activation-requests`, 'aziz');
  check(asked, { 'activation requested (201)': (r) => r.status === 201 && r.json('status') === 'PENDING' });
  check(admin(`${id}/activation-requests`, 'malika'), { 'one waiting request (409)': (r) => r.status === 409 && r.json('code') === 'ACTIVATION_REQUEST_PENDING' });
  const rid = asked.json('id');
  check(decide(rid, 'approve', 'aziz'), { 'no self-approval (409)': (r) => r.status === 409 && r.json('code') === 'SELF_APPROVAL' });
  check(decide(rid, 'approve', 'malika'), { 'second admin approves': (r) => r.status === 200 && r.json('status') === 'APPROVED' });
  check(http.get(`${BASE_URL}/api/v1/partners/${id}`, { headers: bearer(tokens.aziz) }), { active: (r) => r.json('status') === 'ACTIVE' });
  check(admin(`${id}/suspend`, 'malika', { reason: 'Chargebacks above limit' }), { suspended: movedTo('SUSPENDED') });
  check(admin(`${id}/restore`, 'malika'), { restored: movedTo('ACTIVE') });
  check(admin(`${id}/terminate`, 'malika', { reason: 'Contract ended' }), { terminated: movedTo('TERMINATED') });
  check(admin(`${id}/restore`, 'malika'), { 'terminated is final (409)': (r) => r.status === 409 });

  const history = http.get(`${BASE_URL}/api/v1/admin/partners/${id}/history`, { headers: bearer(tokens.aziz), tags: { name: 'admin' } });
  check(history, {
    'seven changes recorded': (r) => r.status === 200 && r.json().length === 7,
    'the checker activated': (r) => r.json('3.changedBy') === 'malika',
  });
}
