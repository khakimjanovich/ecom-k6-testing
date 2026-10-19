// Shared settings for every scenario. BASE_URL points at a running ecom app, KEYCLOAK_URL at its Keycloak.
export const BASE_URL = __ENV.BASE_URL || 'http://app:8080'; // ecom-infra's load stack (1 CPU, 2 GB RAM), inside its Docker network
export const KEYCLOAK_URL = __ENV.KEYCLOAK_URL || 'http://keycloak:8080';
export const VAULT_URL = __ENV.VAULT_URL || 'http://vault:8200';
export const VAULT_TOKEN = __ENV.VAULT_TOKEN || 'local-only';
// The processing sandbox (WireMock): it also plays the merchant's webhook endpoint, and its journal shows what arrived.
export const SANDBOX_URL = __ENV.SANDBOX_URL || 'http://processing-sandbox:8080';
export const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'local-only';
export const PARTNER_PASSWORD = 'correct-horse-42';
