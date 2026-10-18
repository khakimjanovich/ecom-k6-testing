# acquiring-load-tests

Grafana k6 scenarios for `acquiring-backend` (Series B). Every episode that adds an endpoint adds a scenario here.

| Folder | What it proves |
|---|---|
| `smoke/` | the app is up and healthy |
| `partner/` | partner reads stay fast under load (episode 03) |

```bash
./run.sh smoke/health.js
./run.sh partner/get-partner.js
```

Each script has thresholds: a run fails if latency or error rate goes past them.
From episode 17, results also go to Prometheus and Grafana next to the app's own metrics.
