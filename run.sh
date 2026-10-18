#!/usr/bin/env sh
# Run one scenario with the pinned k6 image: ./run.sh smoke/health.js
set -eu
exec docker run --rm -i -v "$PWD:/scripts" -w /scripts \
  -e BASE_URL -e PARTNER_ID \
  grafana/k6:1.3.0 run "$1"
