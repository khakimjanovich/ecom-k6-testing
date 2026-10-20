// A merchant server's request: an access token from its API client, and an RFC 9421 HTTP Message
// Signature (hmac-sha256, the client's signing key) over the method, the full URI, the token and
// the body's Content-Digest (RFC 9530), with created, nonce and keyid.
import http from 'k6/http';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';
import { bearer, clientToken } from './auth.js';
import { BASE_URL } from './config.js';

export const serverToken = (client) => clientToken(client.clientId, client.clientSecret).json('access_token');

export const nonce = () => `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;

// The API client's id, from the token's azp claim: the signature's keyid.
const clientIdOf = (token) => JSON.parse(encoding.b64decode(token.split('.')[1], 'rawurl', 's')).azp;

export function signedRequest(method, path, { token, signingKey, body = '', idempotencyKey, timestamp, nonceValue, name }) {
  const created = timestamp ?? String(Math.floor(Date.now() / 1000));
  const n = nonceValue ?? nonce();
  const uri = `${BASE_URL}${path}`;
  const authorization = `Bearer ${token}`;
  const digest = body ? `sha-256=:${crypto.sha256(body, 'base64')}:` : null;
  const components = ['"@method"', '"@target-uri"', '"authorization"', ...(digest ? ['"content-digest"'] : [])];
  const params = `(${components.join(' ')});created=${created};nonce="${n}";keyid="${clientIdOf(token)}";alg="hmac-sha256"`;
  const base = [
    `"@method": ${method}`,
    `"@target-uri": ${uri}`,
    `"authorization": ${authorization}`,
    ...(digest ? [`"content-digest": ${digest}`] : []),
    `"@signature-params": ${params}`,
  ].join('\n');
  const headers = {
    'Content-Type': 'application/json',
    'Signature-Input': `sig1=${params}`,
    Signature: `sig1=:${crypto.hmac('sha256', encoding.b64decode(signingKey), base, 'base64')}:`,
    ...bearer(token),
  };
  if (digest) headers['Content-Digest'] = digest;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  return http.request(method, uri, body || null, { headers, tags: name ? { name } : {} });
}
