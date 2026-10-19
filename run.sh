#!/usr/bin/env sh
# Run one scenario with the pinned k6 image: ./run.sh smoke/health.js
set -eu
exec docker run --rm -i -v "$PWD:/scripts" -w /scripts \
  -e BASE_URL -e KEYCLOAK_URL -e ADMIN_PASSWORD -e PARTNER_ID -e MAILPIT_URL -e VAULT_URL -e VAULT_TOKEN \
  grafana/k6:1.3.0 run "$1"
