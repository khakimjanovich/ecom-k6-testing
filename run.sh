#!/usr/bin/env sh
# Run one scenario with the pinned k6 image: ./run.sh smoke/health.js
# k6 joins the stack's Docker network and calls each service by name, not through published ports.
set -eu
exec docker run --rm -i --network ecom_default -v "$PWD:/scripts" -w /scripts \
  -e BASE_URL -e KEYCLOAK_URL -e ADMIN_PASSWORD -e PARTNER_ID -e MAILPIT_URL -e VAULT_URL -e VAULT_TOKEN -e SANDBOX_URL \
  grafana/k6:1.3.0 run "$1"
