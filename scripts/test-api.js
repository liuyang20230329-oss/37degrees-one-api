/**
 * API 手动测试脚本
 *
 * 按顺序调用以下接口验证基本功能：
 * 1. /health         → 健康检查
 * 2. /api/v1/status  → 状态接口
 * 3. /auth/sms/send  → 发送验证码
 * 4. /auth/register  → 注册新用户
 * 5. /auth/me        → 获取当前用户信息
 *
 * 用法：node scripts/test-api.js
 * 可通过 LOCAL_API_BASE_URL 环境变量指定服务地址
 */

const baseUrl = process.env.LOCAL_API_BASE_URL || 'http://127.0.0.1:3001';

async function main() {
  console.log('='.repeat(50));
  console.log('🚀 开始测试 37° Local API');
  console.log(`📡 Base URL: ${baseUrl}`);
  console.log('='.repeat(50));

  /* 生成随机手机号用于注册测试 */
  const phoneSuffix = String(Date.now()).slice(-4).padStart(4, '0');
  const phoneNumber = `1380013${phoneSuffix}`;

  /* 步骤 1：健康检查 */
  const health = await fetchJson('/health');
  console.log('✅ 健康检查通过', health);

  /* 步骤 2：状态接口 */
  const status = await fetchJson('/api/v1/status');
  console.log('✅ 状态接口通过', status);

  /* 步骤 3：发送验证码 */
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
  console.log('✅ 短信验证码申请通过', sms);

  /* 步骤 4：注册新用户 */
  const register = await fetchJson('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: '测试用户',
      phoneNumber,
      smsCode: sms.debugCode,
      password: 'Password123!',
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  });
  console.log('✅ 注册通过', {
    userId: register.user?.id,
    phoneNumber,
  });

  /* 步骤 5：使用注册返回的 token 获取当前用户信息 */
  const me = await fetchJson('/api/v1/auth/me', {
    headers: {
      Authorization: `Bearer ${register.token}`,
    },
  });
  console.log('✅ 当前用户接口通过', me);

  console.log('\n🎉 测试完成');
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

main().catch((error) => {
  console.error('❌ 测试失败:', error.message);
  process.exit(1);
});
