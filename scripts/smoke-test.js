/**
 * 冒烟测试脚本
 *
 * 验证核心 API 流程：
 * 1. 健康检查（含数据库连接检测）
 * 2. 发送验证码
 * 3. 注册新用户
 * 4. 获取会话列表（分页）
 * 5. 获取广场轮播
 */

const assert = require('assert');

const baseUrl = process.env.LOCAL_API_BASE_URL || 'http://127.0.0.1:3001';

const SMS_CODE = '246810';

async function main() {
  const phoneNumber = buildSmokePhoneNumber();

  const health = await fetchJson('/health');
  assert.equal(health.status, 'ok');
  assert.equal(health.database, 'connected');
  console.log('✅ health');

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
  assert.ok(sms.sessionId);
  assert.ok(sms.expiresAt);
  assert.ok(!sms.debugCode, 'debugCode should not be exposed');
  console.log('✅ sms/send (debugCode removed)');

  const registration = await fetchJson('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: '联调测试',
      phoneNumber,
      smsCode: SMS_CODE,
      password: 'Password123!',
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const token = registration.token;
  assert.ok(token);
  console.log('✅ register');

  const conversations = await fetchJson('/api/v1/chat/conversations', {
    headers: bearer(token),
  });
  assert.ok(Array.isArray(conversations.conversations));
  console.log('✅ chat/conversations');

  const banners = await fetchJson('/api/v1/square/banner', {
    headers: bearer(token),
  });
  assert.ok(Array.isArray(banners.items));
  console.log('✅ square/banner');

  const squareUsers = await fetchJson('/api/v1/square/users?page=1&pageSize=5', {
    headers: bearer(token),
  });
  assert.ok(Array.isArray(squareUsers.users));
  assert.ok(typeof squareUsers.total === 'number');
  assert.ok(typeof squareUsers.page === 'number');
  console.log('✅ square/users (pagination)');

  const circlePosts = await fetchJson('/api/v1/circle/posts?page=1&pageSize=5', {
    headers: bearer(token),
  });
  assert.ok(Array.isArray(circlePosts.posts));
  assert.ok(typeof circlePosts.total === 'number');
  console.log('✅ circle/posts (pagination)');

  const circleLike = await fetchJson('/api/v1/circle/posts/circle-1/like', {
    method: 'POST',
    headers: bearer(token),
  });
  assert.equal(circleLike.success, true);
  console.log('✅ circle/like');

  console.log('\nSmoke test passed.');
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
    'Content-Type': 'application/json',
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
