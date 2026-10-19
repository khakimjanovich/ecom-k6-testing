// A merchant server's request: an access token from its API client, and an HMAC-SHA256 signature over
// METHOD, PATH, X-Timestamp, X-Nonce and the body's SHA-256, with the client's signing key.
import http from 'k6/http';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';
import { bearer, clientToken } from './auth.js';
import { BASE_URL } from './config.js';

export const serverToken = (client) => clientToken(client.clientId, client.clientSecret).json('access_token');

export const nonce = () => `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;

export function signedRequest(method, path, { token, signingKey, body = '', idempotencyKey, timestamp, nonceValue, name }) {
  const ts = timestamp ?? String(Math.floor(Date.now() / 1000));
  const n = nonceValue ?? nonce();
  const text = [method, path, ts, n, crypto.sha256(body, 'hex')].join('\n');
  const headers = {
    'Content-Type': 'application/json',
    'X-Timestamp': ts,
    'X-Nonce': n,
    'X-Signature': crypto.hmac('sha256', encoding.b64decode(signingKey), text, 'base64'),
    ...bearer(token),
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  return http.request(method, `${BASE_URL}${path}`, body || null, { headers, tags: name ? { name } : {} });
}
