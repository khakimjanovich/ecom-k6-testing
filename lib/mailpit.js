// Reads the latest one-time code sent to an address, through Mailpit's API.
import http from 'k6/http';

export const MAILPIT_URL = __ENV.MAILPIT_URL || 'http://host.docker.internal:8025';

export function latestCode(email) {
  const search = http.get(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  const id = search.json('messages.0.ID');
  if (!id) return null;
  const text = http.get(`${MAILPIT_URL}/api/v1/message/${id}`).json('Text');
  const match = /\b(\d{6})\b/.exec(text || '');
  return match ? match[1] : null;
}
