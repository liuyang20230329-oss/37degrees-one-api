/**
 * 冒烟测试脚本
 *
 * 快速验证核心 API 流程是否正常工作：
 * 1. 健康检查 → 断言 status === 'ok'
 * 2. 发送验证码 → 断言返回固定验证码 '246810'
 * 3. 注册新用户 → 断言返回有效 token
 * 4. 获取会话列表 → 断言返回数组
 * 5. 获取广场轮播 → 断言返回数组
 *
 * 用法：node scripts/smoke-test.js（或 npm run smoke）
 * 可通过 LOCAL_API_BASE_URL 环境变量指定服务地址
 */

const assert = require('assert');

const baseUrl = process.env.LOCAL_API_BASE_URL || 'http://127.0.0.1:3001';

async function main() {
  const phoneNumber = buildSmokePhoneNumber();

  /* 健康检查 */
  const health = await fetchJson('/health');
  assert.equal(health.status, 'ok');

  /* 发送验证码 */
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

  /* 注册 */
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

  /* 获取会话列表 */
  const conversations = await fetchJson('/api/v1/chat/conversations', {
    headers: bearer(token),
  });
  assert.ok(Array.isArray(conversations.conversations));

  /* 获取广场轮播 */
  const banners = await fetchJson('/api/v1/square/banner', {
    headers: bearer(token),
  });
  assert.ok(Array.isArray(banners.items));

  console.log('Smoke test passed.');
}

/** 生成基于时间戳的随机测试手机号 */
function buildSmokePhoneNumber() {
  const suffix = String(Date.now()).slice(-4).padStart(4, '0');
  return `1380013${suffix}`;
}

/** 封装 fetch 请求，自动解析 JSON 并在非 2xx 时抛出异常 */
async function fetchJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

/** 生成 Bearer Token 认证头 */
function bearer(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
