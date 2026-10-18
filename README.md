# ecom-k6-testing

Grafana k6 load and smoke tests for [ecom](https://github.com/khakimjanovich/ecom). Every new endpoint gets a scenario here.

| Folder | What it proves |
|---|---|
| `smoke/` | the app is up and healthy |
| `partner/` | partner reads stay fast under load |
| `registration/` | sign-up, code by email (read from Mailpit), verification |

```bash
./run.sh smoke/health.js
./run.sh partner/get-partner.js
./run.sh registration/register-and-verify.js
```

Each script has thresholds: a run fails if latency or error rate goes past them.
Once the observability stack is in place, results also go to Prometheus and Grafana next to the app's own metrics.
