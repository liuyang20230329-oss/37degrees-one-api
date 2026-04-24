const bcrypt = require('bcryptjs');
const express = require('express');
const { v4: uuidv4 } = require('uuid');

const db = require('../config/database');
const { authenticateToken, signToken } = require('../middleware/auth');
const {
  formatUserRow,
  formatWorkRow,
  maskIdNumber,
  maskPhoneNumber,
} = require('../utils/serializers');

const router = express.Router();

router.post('/sms/send', async (req, res) => {
  await db.ready;
  const phoneNumber = normalizePhoneNumber(req.body.phoneNumber);
  const purpose = req.body.purpose || 'general';

  if (!isValidPhone(phoneNumber)) {
    res.status(400).json({ error: '请输入有效的 11 位手机号。' });
    return;
  }

  const code = '246810';
  const sessionId = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();

  await db.run(
    'INSERT INTO sms_codes (id, phone_number, purpose, code, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [sessionId, phoneNumber, purpose, code, expiresAt, now.toISOString()],
  );

  res.json({
    sessionId,
    phoneNumber,
    debugCode: code,
    expiresAt,
  });
});

router.post('/register', async (req, res) => {
  await db.ready;
  const name = (req.body.name || '').trim();
  const phoneNumber = normalizePhoneNumber(req.body.phoneNumber);
  const smsCode = (req.body.smsCode || '').trim();
  const password = req.body.password || '';

  if (name.length < 2) {
    res.status(400).json({ error: '昵称至少需要 2 个字符。' });
    return;
  }
  if (!isValidPhone(phoneNumber)) {
    res.status(400).json({ error: '请输入有效的 11 位手机号。' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: '密码至少需要 8 位。' });
    return;
  }

  const latestCode = await db.get(
    `SELECT * FROM sms_codes
     WHERE phone_number = ? AND purpose = 'register'
     ORDER BY created_at DESC LIMIT 1`,
    [phoneNumber],
  );
  if (!latestCode || latestCode.code !== smsCode) {
    res.status(400).json({ error: '注册验证码不正确。' });
    return;
  }
  if (new Date(latestCode.expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: '注册验证码已过期。' });
    return;
  }

  const existingUser = await db.get(
    'SELECT id FROM users WHERE phone_number = ?',
    [phoneNumber],
  );
  if (existingUser) {
    res.status(400).json({ error: '该手机号已被注册。' });
    return;
  }

  const now = new Date().toISOString();
  const userId = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);
  await db.run(
    `INSERT INTO users (
      id, name, email, phone_number, password_hash, avatar_key, gender,
      city, signature, intro_video_title, intro_video_summary, phone_status,
      masked_phone_number, phone_verified_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      name,
      `${phoneNumber}@37degrees.local`,
      phoneNumber,
      passwordHash,
      'aurora',
      'undisclosed',
      '未设置地区',
      '这个人很酷，还没有留下签名。',
      '还没有上传视频介绍',
      '后续可以用一段视频介绍自己，让更多人更快认识你。',
      'verified',
      maskPhoneNumber(phoneNumber),
      now,
      now,
      now,
    ],
  );
  await db.run(
    'INSERT OR REPLACE INTO chat_user_privacy_settings (user_id, friends_only, allow_square_exposure, prefer_verified_users) VALUES (?, ?, ?, ?)',
    [userId, 0, 1, 1],
  );
  await db.run(
    'UPDATE sms_codes SET consumed_at = ? WHERE id = ?',
    [now, latestCode.id],
  );

  const user = await loadUserWithWorks(userId);
  const token = signToken(user);
  await createDeviceSession(userId, req);

  res.status(201).json({
    user,
    token,
  });
});

router.post('/login', async (req, res) => {
  await db.ready;
  const phoneNumber = normalizePhoneNumber(req.body.phoneNumber);
  const password = req.body.password || '';

  const user = await db.get(
    'SELECT * FROM users WHERE phone_number = ? AND deleted_at IS NULL',
    [phoneNumber],
  );
  if (!user) {
    res.status(401).json({ error: '该手机号尚未注册账号。' });
    return;
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    res.status(401).json({ error: '密码不正确，请重试。' });
    return;
  }

  await db.run(
    'UPDATE users SET is_online = 1, updated_at = ? WHERE id = ?',
    [new Date().toISOString(), user.id],
  );
  await createDeviceSession(user.id, req);

  res.json({
    user: await loadUserWithWorks(user.id),
    token: signToken(user),
  });
});

router.get('/me', authenticateToken, async (req, res) => {
  await db.ready;
  const user = await loadUserWithWorks(req.auth.userId);
  if (!user) {
    res.status(404).json({ error: '未找到当前用户。' });
    return;
  }

  res.json({ user });
});

router.post('/phone/confirm', authenticateToken, async (req, res) => {
  await db.ready;
  const phoneNumber = normalizePhoneNumber(req.body.phoneNumber);
  const code = (req.body.code || '').trim();

  const latestCode = await db.get(
    `SELECT * FROM sms_codes
     WHERE phone_number = ? AND purpose = 'verify-phone'
     ORDER BY created_at DESC LIMIT 1`,
    [phoneNumber],
  );
  if (!latestCode || latestCode.code !== code) {
    res.status(400).json({ error: '验证码不正确。' });
    return;
  }
  const now = new Date().toISOString();
  await db.run(
    `UPDATE users
     SET phone_number = ?, masked_phone_number = ?, phone_status = 'verified',
         phone_verified_at = ?, updated_at = ?
     WHERE id = ?`,
    [phoneNumber, maskPhoneNumber(phoneNumber), now, now, req.auth.userId],
  );
  await db.run(
    'UPDATE sms_codes SET consumed_at = ? WHERE id = ?',
    [now, latestCode.id],
  );

  res.json({
    user: await loadUserWithWorks(req.auth.userId),
  });
});

router.post('/password-reset/request', async (req, res) => {
  await db.ready;
  const phoneNumber = normalizePhoneNumber(req.body.phoneNumber);
  const user = await db.get(
    'SELECT id FROM users WHERE phone_number = ? AND deleted_at IS NULL',
    [phoneNumber],
  );
  if (!user) {
    res.status(404).json({ error: '该手机号尚未注册账号。' });
    return;
  }

  const code = '246810';
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await db.run(
    'INSERT INTO sms_codes (id, phone_number, purpose, code, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [sessionId, phoneNumber, 'password-reset', code, expiresAt, new Date().toISOString()],
  );

  res.json({
    sessionId,
    debugCode: code,
    expiresAt,
  });
});

router.post('/password-reset/confirm', async (req, res) => {
  await db.ready;
  const phoneNumber = normalizePhoneNumber(req.body.phoneNumber);
  const code = (req.body.code || '').trim();
  const newPassword = req.body.newPassword || '';
  if (newPassword.length < 8) {
    res.status(400).json({ error: '新密码至少需要 8 位。' });
    return;
  }

  const latestCode = await db.get(
    `SELECT * FROM sms_codes
     WHERE phone_number = ? AND purpose = 'password-reset'
     ORDER BY created_at DESC LIMIT 1`,
    [phoneNumber],
  );
  if (!latestCode || latestCode.code !== code) {
    res.status(400).json({ error: '验证码不正确。' });
    return;
  }

  await db.run(
    'UPDATE users SET password_hash = ?, updated_at = ? WHERE phone_number = ?',
    [await bcrypt.hash(newPassword, 10), new Date().toISOString(), phoneNumber],
  );
  await db.run(
    'UPDATE sms_codes SET consumed_at = ? WHERE id = ?',
    [new Date().toISOString(), latestCode.id],
  );
  res.json({ success: true });
});

router.post('/social/:provider(wechat|qq)', async (req, res) => {
  res.status(501).json({
    error: `${req.params.provider === 'wechat' ? '微信' : 'QQ'}登录待配置，请先使用手机号登录。`,
  });
});

router.post('/social/bind', authenticateToken, async (req, res) => {
  await db.ready;
  const provider = req.body.provider;
  if (!provider) {
    res.status(400).json({ error: '缺少第三方平台标识。' });
    return;
  }
  await db.run(
    'INSERT INTO user_social_accounts (id, user_id, provider, provider_uid, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [uuidv4(), req.auth.userId, provider, req.body.providerUid || null, 'pending', new Date().toISOString()],
  );
  res.json({ success: true });
});

router.post('/social/unbind', authenticateToken, async (req, res) => {
  await db.ready;
  await db.run(
    'DELETE FROM user_social_accounts WHERE user_id = ? AND provider = ?',
    [req.auth.userId, req.body.provider],
  );
  res.json({ success: true });
});

router.post('/logout', authenticateToken, async (req, res) => {
  await db.ready;
  await db.run(
    'UPDATE users SET is_online = 0, updated_at = ? WHERE id = ?',
    [new Date().toISOString(), req.auth.userId],
  );
  res.json({ success: true });
});

async function loadUserWithWorks(userId) {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) {
    return null;
  }
  const works = await db.all(
    'SELECT * FROM user_works WHERE user_id = ? ORDER BY is_pinned DESC, created_at DESC',
    [userId],
  );
  return formatUserRow(user, works.map(formatWorkRow));
}

async function createDeviceSession(userId, req) {
  const now = new Date().toISOString();
  await db.run(
    'UPDATE user_device_sessions SET is_current = 0 WHERE user_id = ?',
    [userId],
  );
  await db.run(
    `INSERT INTO user_device_sessions
     (id, user_id, device_name, platform, ip_address, status, is_current, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      userId,
      req.headers['user-agent'] || 'Unknown device',
      inferPlatform(req.headers['user-agent']),
      req.ip,
      'active',
      1,
      now,
      now,
    ],
  );
}

function inferPlatform(userAgent = '') {
  if (/Android/i.test(userAgent)) {
    return 'android';
  }
  if (/Windows/i.test(userAgent)) {
    return 'windows';
  }
  return 'unknown';
}

function normalizePhoneNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

function isValidPhone(value) {
  return /^1\d{10}$/.test(value);
}

module.exports = router;
