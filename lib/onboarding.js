// Getting a merchant to the state a scenario needs: signed up, email verified, or fully active.
import http from 'k6/http';
import { bearer, login } from './auth.js';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';
import { ADMIN_PASSWORD, BASE_URL, PARTNER_PASSWORD, VAULT_TOKEN, VAULT_URL } from './config.js';
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

/** A merchant taken all the way to ACTIVE by two admins; returns its id and the tokens the scenarios need. */
export function activeMerchant(prefix) {
  const aziz = login('aziz', ADMIN_PASSWORD);
  const malika = login('malika', ADMIN_PASSWORD);
  const { id, email } = signUp(prefix);
  verifyEmail(email);
  const admin = (path, token, body) =>
    http.post(`${BASE_URL}/api/v1/admin/${path}`, body ? JSON.stringify(body) : null, {
      headers: { ...JSON_HEADERS, ...bearer(token) },
    });
  admin(`partners/${id}/verify`, aziz);
  admin(`partners/${id}/contract`, aziz, { contractNumber: `HP-${id}` });
  const requestId = admin(`partners/${id}/activation-requests`, aziz).json('id');
  admin(`activation-requests/${requestId}/approve`, malika);
  return { id, email, partner: login(email, PARTNER_PASSWORD), aziz, malika };
}

/** An active merchant with a live website (both card schemes) and an API client for its server. */
export function liveWebsite(prefix) {
  const merchant = activeMerchant(prefix);
  const call = (method, path, token, body) =>
    http.request(method, `${BASE_URL}${path}`, body ? JSON.stringify(body) : null, { headers: { ...JSON_HEADERS, ...bearer(token) } });
  const site = `https://${prefix}-${Date.now()}.example.uz`;
  const salesPointId = call('POST', '/api/v1/partner/sales-points', merchant.partner, { name: 'Shop', websiteUrl: site, returnUrls: [`${site}/done`] }).json('id');
  const admin = `/api/v1/admin/sales-points/${salesPointId}`;
  call('POST', `${admin}/site-checks`, merchant.aziz, { result: 'PASSED', findings: [] });
  call('PUT', `${admin}/settings`, merchant.aziz, { schemes: ['UZCARD', 'HUMO'], refundWindowDays: 14 });
  call('POST', `${admin}/activate`, merchant.aziz);
  const client = call('POST', '/api/v1/partner/clients', merchant.partner).json();
  client.signingKey = putSigningKey(client.clientId);
  return { ...merchant, salesPointId, site, client };
}

/** The bank puts each API client's signing key straight into Vault; the app only reads it. */
export function putSigningKey(clientId) {
  const key = encoding.b64encode(crypto.randomBytes(32));
  http.post(`${VAULT_URL}/v1/secret/data/merchants/${clientId}`, JSON.stringify({ data: { signingKey: key } }), {
    headers: { 'X-Vault-Token': VAULT_TOKEN, 'Content-Type': 'application/json' },
  });
  return key;
}
