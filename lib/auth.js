// Access tokens from Keycloak (realm ecom): people log in through the portal client, machines with client credentials.
import http from 'k6/http';
import { KEYCLOAK_URL } from './config.js';

const TOKEN_URL = `${KEYCLOAK_URL}/realms/ecom/protocol/openid-connect/token`;

export function login(username, password) {
  const res = http.post(TOKEN_URL, { grant_type: 'password', client_id: 'ecom-portal', username, password }, { tags: { name: 'login' } });
  return res.json('access_token');
}

export function clientToken(clientId, clientSecret) {
  return http.post(TOKEN_URL, { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }, { tags: { name: 'login' } });
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });
