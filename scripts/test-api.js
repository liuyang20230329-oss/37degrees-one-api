const baseUrl = process.env.LOCAL_API_BASE_URL || 'http://127.0.0.1:3001';

async function main() {
  console.log('='.repeat(50));
  console.log('🚀 开始测试 37° Local API');
  console.log(`📡 Base URL: ${baseUrl}`);
  console.log('='.repeat(50));

  const phoneSuffix = String(Date.now()).slice(-4).padStart(4, '0');
  const phoneNumber = `1380013${phoneSuffix}`;

  const health = await fetchJson('/health');
  console.log('✅ 健康检查通过', health);

  const status = await fetchJson('/api/v1/status');
  console.log('✅ 状态接口通过', status);

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

  const me = await fetchJson('/api/v1/auth/me', {
    headers: {
      Authorization: `Bearer ${register.token}`,
    },
  });
  console.log('✅ 当前用户接口通过', me);

  console.log('\n🎉 测试完成');
}

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
