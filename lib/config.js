// Shared settings for every scenario. BASE_URL points at a running ecom app, KEYCLOAK_URL at its Keycloak.
export const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:8080';
export const KEYCLOAK_URL = __ENV.KEYCLOAK_URL || 'http://host.docker.internal:8180';
export const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'local-only';
export const PARTNER_PASSWORD = 'correct-horse-42';
