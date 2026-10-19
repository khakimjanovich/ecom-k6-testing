# ecom-k6-testing

Scenarios run against the system under load from [ecom-infra](https://github.com/khakimjanovich/ecom-infra) (`load/docker-compose.yml`): the app and its services, each limited like the target server (1 CPU, 2 GB RAM, 256 GB SSD), on http://localhost:8085. The numbers measure the code, not the laptop. `BASE_URL` points elsewhere if needed.

Grafana k6 load and smoke tests for [ecom](https://github.com/khakimjanovich/ecom). Every new endpoint gets a scenario here.

| Folder | What it proves |
|---|---|
| `smoke/` | the app is up and healthy |
| `partner/` | admin reads stay fast under load; a partner's API clients log in and rotate secrets |
| `registration/` | sign-up, code by email (read from Mailpit), verification |
| `sales-points/` | websites: foreign return URLs refused, site check, terms, activation only after a passed check, suspend and restore |
| `commission/` | two admins agree on fee rules (no self-approval, no overlaps); fast quotes where the sales point rule wins; a fee taking everything is refused |
| `terminals/` | terminals per website and card: one live route, suspend means no route, revoked MID/TID never reused, every change audited |
| `payments/` | signed payment requests: created once per Idempotency-Key, replays, old timestamps, forged signatures and reused keys refused |
| `cards/` | BIN registry: sync from both schemes, lookup by first digits, unknown BINs refused; card search never returns a number |
| `lifecycle/` | admins verify, sign the contract, activate with four eyes, suspend, restore, terminate; history and refused moves |

```bash
./run.sh smoke/health.js
./run.sh partner/get-partner.js
./run.sh partner/api-client.js
./run.sh registration/register-and-verify.js
./run.sh lifecycle/partner-lifecycle.js
./run.sh sales-points/site-check-and-activate.js
./run.sh commission/rules-and-quotes.js
./run.sh terminals/register-and-route.js
./run.sh cards/bins-and-vault.js
./run.sh payments/create-payment.js
```

Admin calls use Keycloak tokens for `aziz` and `malika` (local password from `ADMIN_PASSWORD`, default `local-only`).
Each script has thresholds: a run fails if latency or error rate goes past them.
Once the observability stack is in place, results also go to Prometheus and Grafana next to the app's own metrics.

**On macOS with Docker Desktop**, a run can show a few failed checks with status `0` and `dial: i/o timeout`: the k6 container could not open a connection through Docker Desktop's port forwarding, so the request never reached the app. Each one also stalls that virtual user for 30 seconds. They are rare (a few per ten thousand) and stay under the thresholds; on Linux they don't happen.

## Baselines

Measured 2026-10-19 on ecom-infra's load stack (the app at 1 CPU and 2 GB RAM; target server: 1 CPU, 2 GB RAM, 256 GB SSD), with a warmed-up JVM, 30 s per scenario. Each threshold is the measured p95 plus 25% or 5 ms, whichever is larger, rounded up to 5 ms. A run that misses one means the code got slower, or the server is too small.

| Scenario | Metric | p95 | Threshold | Throughput |
|---|---|---|---|---|
| `smoke/health.js` | all requests | 1.8 ms | 10 ms | 676 req/s |
| `registration/register-and-verify.js` | register / verify | 36.6 / 17.0 ms | 50 / 25 ms | 111 sign-ups/s |
| `lifecycle/partner-lifecycle.js` | admin actions | 5.3 ms | 15 ms | 29 lifecycles/s |
| `partner/get-partner.js` | all requests (p99 83 ms) | 77.2 ms | 100 ms (p99 105 ms) | 1,010 req/s, the 1 CPU saturated |
| `partner/api-client.js` | clients | 8.7 ms | 15 ms | 126 iterations/s |
| `sales-points/site-check-and-activate.js` | sales points | 3.4 ms | 10 ms | 17 websites/s |
| `commission/rules-and-quotes.js` | quote / rules | 2.1 / 3.2 ms | 10 / 10 ms | 29 iterations/s |
| `terminals/register-and-route.js` | terminals | 2.3 ms | 10 ms | 174 iterations/s |
| `cards/bins-and-vault.js` | BIN lookup | 64.1 ms | 85 ms | 43 iterations/s |
| `payments/create-payment.js` | create payment | 39.5 ms | 50 ms | 136 payments/s |

On one CPU the JVM's own threads (garbage collection, JIT) compete with requests, so some p95s are bimodal: most requests take 2–4 ms, and a few wait for the next CPU time slice (~70 ms). A cold app right after start is slower until hot code is compiled, so warm it up (e.g. `smoke/health.js`) before measuring.
