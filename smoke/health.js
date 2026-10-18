// Smoke (day one): is the app up and healthy? One user, a few seconds.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from '../lib/config.js';

export const options = {
  vus: 1,
  duration: '10s',
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<200'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/actuator/health`);
  check(res, { 'status is UP': (r) => r.status === 200 && r.json('status') === 'UP' });
}
