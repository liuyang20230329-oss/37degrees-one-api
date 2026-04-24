/**
 * 用户路由模块 (/api/v1/users)
 *
 * 提供完整的用户信息管理和个人设置功能：
 * - GET    /me/complete               → 获取当前用户完整信息（含作品列表）
 * - PUT    /me/profile                → 更新用户资料（昵称、头像、性别、生日、城市、签名等）
 * - GET    /me/settings               → 获取隐私和通知设置
 * - PUT    /me/settings               → 更新隐私设置
 * - GET    /me/devices                → 获取登录设备列表
 * - POST   /me/devices/:deviceId/revoke → 注销指定设备会话
 * - GET    /me/blacklist              → 获取黑名单列表
 * - POST   /me/blacklist              → 添加用户到黑名单
 * - DELETE /me/blacklist/:targetUserId → 从黑名单移除用户
 * - POST   /me/works                  → 创建用户作品
 * - DELETE /me/works/:workId          → 删除用户作品
 * - POST   /me/cancel                 → 注销账号（软删除，7天冷却期）
 * - GET    /:userId                   → 查看其他用户公开信息
 *
 * 所有 /me/* 接口均需登录认证，查看他人信息接口无需认证
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const {
  formatUserRow,
  formatWorkRow,
  maskPhoneNumber,
} = require('../utils/serializers');

const router = express.Router();

/** 获取当前登录用户的完整信息（包含关联的作品列表） */
router.get('/me/complete', authenticateToken, async (req, res) => {
  await db.ready;
  const user = await loadUserWithWorks(req.auth.userId);
  if (!user) {
    res.status(404).json({ error: '未找到当前用户。' });
    return;
  }
  res.json({ user });
});

/**
 * 更新用户资料
 * 支持的字段：name / avatarKey / gender / birthYear / birthMonth / city / signature / introVideoTitle / introVideoSummary
 * 特殊逻辑：
 * - 修改头像后自动重置人脸认证状态（需要重新认证）
 * - 性别只能在"未设置"状态下修改一次
 * - 可同步更新作品列表（先删除旧作品再批量插入）
 */
router.put('/me/profile', authenticateToken, async (req, res) => {
  await db.ready;
  const current = await db.get('SELECT * FROM users WHERE id = ?', [req.auth.userId]);
  if (!current) {
    res.status(404).json({ error: '未找到当前用户。' });
    return;
  }

  /* 动态构建 UPDATE 语句 */
  const updates = [];
  const values = [];
  const now = new Date().toISOString();
  const assign = (field, value) => {
    updates.push(`${field} = ?`);
    values.push(value);
  };

  if (typeof req.body.name === 'string' && req.body.name.trim().length > 0) {
    assign('name', req.body.name.trim());
  }
  /* 更换头像后需要重新进行人脸认证 */
  if (typeof req.body.avatarKey === 'string' && req.body.avatarKey.trim()) {
    assign('avatar_key', req.body.avatarKey.trim());
    assign('face_status', 'notStarted');
    assign('face_match_score', null);
    assign('face_verified_at', null);
  }
  /* 性别仅在未设置时可修改 */
  if (typeof req.body.gender === 'string' && current.gender === 'undisclosed') {
    assign('gender', req.body.gender);
  }
  if (req.body.birthYear) {
    assign('birth_year', Number(req.body.birthYear));
  }
  if (req.body.birthMonth) {
    assign('birth_month', Number(req.body.birthMonth));
  }
  if (typeof req.body.city === 'string') {
    assign('city', req.body.city.trim());
  }
  if (typeof req.body.signature === 'string') {
    assign('signature', req.body.signature.trim());
  }
  if (typeof req.body.introVideoTitle === 'string') {
    assign('intro_video_title', req.body.introVideoTitle.trim());
  }
  if (typeof req.body.introVideoSummary === 'string') {
    assign('intro_video_summary', req.body.introVideoSummary.trim());
  }

  if (updates.length > 0) {
    assign('updated_at', now);
    values.push(req.auth.userId);
    await db.run(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values,
    );
  }

  /* 同步更新作品列表（全量替换） */
  if (Array.isArray(req.body.works)) {
    await db.run('DELETE FROM user_works WHERE user_id = ?', [req.auth.userId]);
    for (const work of req.body.works) {
      await db.run(
        `INSERT INTO user_works
         (id, user_id, type, title, summary, media_url, duration, is_pinned, review_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          work.id || uuidv4(),
          req.auth.userId,
          work.type || 'image',
          work.title || '未命名作品',
          work.summary || '',
          work.mediaUrl || null,
          work.duration || null,
          work.isPinned ? 1 : 0,
          work.reviewStatus || 'approved',
          now,
        ],
      );
    }
  }

  res.json({
    user: await loadUserWithWorks(req.auth.userId),
  });
});

/** 获取当前用户的隐私和通知设置 */
router.get('/me/settings', authenticateToken, async (req, res) => {
  await db.ready;
  const privacy = await db.get(
    'SELECT * FROM chat_user_privacy_settings WHERE user_id = ?',
    [req.auth.userId],
  );
  res.json({
    privacy: privacy || {
      user_id: req.auth.userId,
      friends_only: 0,
      allow_square_exposure: 1,
      prefer_verified_users: 1,
    },
    notifications: {
      receiveSystemNotices: true,
      allowNearbyExposure: true,
    },
    cache: {
      cacheSizeLabel: '12.4 MB',
      cachedDays: 30,
    },
  });
});

/** 更新聊天隐私设置（好友可见、广场曝光、优先已认证用户） */
router.put('/me/settings', authenticateToken, async (req, res) => {
  await db.ready;
  await db.run(
    `INSERT OR REPLACE INTO chat_user_privacy_settings
     (user_id, friends_only, allow_square_exposure, prefer_verified_users)
     VALUES (?, ?, ?, ?)`,
    [
      req.auth.userId,
      req.body.friendsOnly ? 1 : 0,
      req.body.allowSquareExposure === false ? 0 : 1,
      req.body.preferVerifiedUsers === false ? 0 : 1,
    ],
  );
  res.json({ success: true });
});

/** 获取当前用户的登录设备会话列表 */
router.get('/me/devices', authenticateToken, async (req, res) => {
  await db.ready;
  const devices = await db.all(
    'SELECT * FROM user_device_sessions WHERE user_id = ? ORDER BY last_seen_at DESC',
    [req.auth.userId],
  );
  res.json({
    devices,
  });
});

/** 注销指定设备会话（用于踢出其他设备） */
router.post('/me/devices/:deviceId/revoke', authenticateToken, async (req, res) => {
  await db.ready;
  await db.run(
    'UPDATE user_device_sessions SET status = ?, is_current = 0 WHERE id = ? AND user_id = ?',
    ['revoked', req.params.deviceId, req.auth.userId],
  );
  res.json({ success: true });
});

/** 获取当前用户的黑名单列表（包含被拉黑用户的昵称） */
router.get('/me/blacklist', authenticateToken, async (req, res) => {
  await db.ready;
  const list = await db.all(
    `SELECT e.id, e.target_user_id AS targetUserId, u.name
     FROM chat_blacklist_entries e
     LEFT JOIN users u ON u.id = e.target_user_id
     WHERE e.user_id = ?`,
    [req.auth.userId],
  );
  res.json({ entries: list });
});

/** 添加用户到黑名单 */
router.post('/me/blacklist', authenticateToken, async (req, res) => {
  await db.ready;
  if (!req.body.targetUserId) {
    res.status(400).json({ error: '缺少要拉黑的用户。' });
    return;
  }
  await db.run(
    'INSERT INTO chat_blacklist_entries (id, user_id, target_user_id, created_at) VALUES (?, ?, ?, ?)',
    [uuidv4(), req.auth.userId, req.body.targetUserId, new Date().toISOString()],
  );
  res.json({ success: true });
});

/** 从黑名单移除用户 */
router.delete('/me/blacklist/:targetUserId', authenticateToken, async (req, res) => {
  await db.ready;
  await db.run(
    'DELETE FROM chat_blacklist_entries WHERE user_id = ? AND target_user_id = ?',
    [req.auth.userId, req.params.targetUserId],
  );
  res.json({ success: true });
});

/** 创建用户作品（图片/视频/语音等） */
router.post('/me/works', authenticateToken, async (req, res) => {
  await db.ready;
  const workId = uuidv4();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO user_works
     (id, user_id, type, title, summary, media_url, duration, is_pinned, review_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      workId,
      req.auth.userId,
      req.body.type || 'image',
      req.body.title || '未命名作品',
      req.body.summary || '',
      req.body.mediaUrl || null,
      req.body.duration || null,
      req.body.isPinned ? 1 : 0,
      'approved',
      now,
    ],
  );
  const work = await db.get('SELECT * FROM user_works WHERE id = ?', [workId]);
  res.status(201).json({ work: formatWorkRow(work) });
});

/** 删除指定作品 */
router.delete('/me/works/:workId', authenticateToken, async (req, res) => {
  await db.ready;
  await db.run(
    'DELETE FROM user_works WHERE id = ? AND user_id = ?',
    [req.params.workId, req.auth.userId],
  );
  res.json({ success: true });
});

/**
 * 注销账号（软删除）
 * 设置 deleted_at 时间戳并标记离线，返回 7 天冷却期结束时间
 */
router.post('/me/cancel', authenticateToken, async (req, res) => {
  await db.ready;
  const now = new Date().toISOString();
  await db.run(
    'UPDATE users SET deleted_at = ?, is_online = 0, updated_at = ? WHERE id = ?',
    [now, now, req.auth.userId],
  );
  res.json({
    success: true,
    cooldownEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
});

/**
 * 查看其他用户的公开信息
 * 无需认证，返回基本资料和作品列表
 */
router.get('/:userId', async (req, res) => {
  await db.ready;
  const user = await db.get(
    `SELECT id, name, avatar_key, gender, birth_year, birth_month, city, signature,
            intro_video_title, intro_video_summary, membership_level, is_online, activity_score
     FROM users WHERE id = ?`,
    [req.params.userId],
  );
  if (!user) {
    res.status(404).json({ error: '未找到该用户。' });
    return;
  }

  const works = await db.all(
    'SELECT * FROM user_works WHERE user_id = ? ORDER BY is_pinned DESC, created_at DESC',
    [req.params.userId],
  );
  res.json({
    user: {
      id: user.id,
      name: user.name,
      avatarKey: user.avatar_key,
      gender: user.gender,
      birthYear: user.birth_year,
      birthMonth: user.birth_month,
      city: user.city,
      signature: user.signature,
      introVideoTitle: user.intro_video_title,
      introVideoSummary: user.intro_video_summary,
      membershipLevel: user.membership_level,
      isOnline: Boolean(user.is_online),
      activityScore: user.activity_score,
      works: works.map(formatWorkRow),
    },
  });
});

/** 加载用户信息及其关联的作品列表，自动补充脱敏手机号 */
async function loadUserWithWorks(userId) {
  const row = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!row) {
    return null;
  }
  const works = await db.all(
    'SELECT * FROM user_works WHERE user_id = ? ORDER BY is_pinned DESC, created_at DESC',
    [userId],
  );
  if (!row.masked_phone_number && row.phone_number) {
    row.masked_phone_number = maskPhoneNumber(row.phone_number);
  }
  return formatUserRow(row, works.map(formatWorkRow));
}

module.exports = router;
