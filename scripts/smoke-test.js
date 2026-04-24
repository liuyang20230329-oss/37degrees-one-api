const assert = require('assert');

const baseUrl = process.env.LOCAL_API_BASE_URL || 'http://127.0.0.1:3001';

async function main() {
  const phoneNumber = buildSmokePhoneNumber();
  const health = await fetchJson('/health');
  assert.equal(health.status, 'ok');

  const sms = await fetchJson('/api/v1/auth/sms/send', {
    method: 'POST',
    body: JSON.stringify({
      phoneNumber,
      purpose: 'register',
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  });
  assert.equal(sms.debugCode, '246810');

  const registration = await fetchJson('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: '联调测试',
      phoneNumber,
      smsCode: sms.debugCode,
      password: 'Password123!',
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const token = registration.token;
  assert.ok(token);

  const conversations = await fetchJson('/api/v1/chat/conversations', {
    headers: bearer(token),
  });
  assert.ok(Array.isArray(conversations.conversations));

  const banners = await fetchJson('/api/v1/square/banner', {
    headers: bearer(token),
  });
  assert.ok(Array.isArray(banners.items));

  console.log('Smoke test passed.');
}

function buildSmokePhoneNumber() {
  const suffix = String(Date.now()).slice(-4).padStart(4, '0');
  return `1380013${suffix}`;
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function bearer(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
