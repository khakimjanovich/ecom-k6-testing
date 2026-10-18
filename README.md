# ecom-k6-testing

Grafana k6 load and smoke tests for [ecom](https://github.com/khakimjanovich/ecom). Every new endpoint gets a scenario here.

| Folder | What it proves |
|---|---|
| `smoke/` | the app is up and healthy |
| `partner/` | admin reads stay fast under load; a partner's API clients log in and rotate secrets |
| `registration/` | sign-up, code by email (read from Mailpit), verification |
| `sales-points/` | websites: foreign return URLs refused, site check, terms, activation only after a passed check, suspend and restore |
| `commission/` | two admins agree on fee rules (no self-approval, no overlaps); fast quotes where the sales point rule wins; a fee taking everything is refused |
| `terminals/` | terminals per website and card: one live route, suspend means no route, revoked MID/TID never reused, every change audited |
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
```

Admin calls use Keycloak tokens for `aziz` and `malika` (local password from `ADMIN_PASSWORD`, default `local-only`).
Each script has thresholds: a run fails if latency or error rate goes past them.
Once the observability stack is in place, results also go to Prometheus and Grafana next to the app's own metrics.

**On macOS with Docker Desktop**, a run can show a few failed checks with status `0` and `dial: i/o timeout`: the k6 container could not open a connection through Docker Desktop's port forwarding, so the request never reached the app. Each one also stalls that virtual user for 30 seconds. They are rare (a few per ten thousand) and stay under the thresholds; on Linux they don't happen.
