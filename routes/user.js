/**
 * 用户路由模块 (/api/v1/users)
 *
 * - GET    /me/complete                  → 完整用户信息
 * - PUT    /me/profile                   → 更新资料（事务保护）
 * - GET    /me/settings                  → 隐私和通知设置
 * - PUT    /me/settings                  → 更新隐私设置
 * - GET    /me/devices                   → 登录设备列表
 * - POST   /me/devices/:deviceId/revoke  → 注销设备
 * - GET    /me/blacklist                 → 黑名单列表
 * - POST   /me/blacklist                 → 添加黑名单（含重复/自己校验）
 * - DELETE /me/blacklist/:targetUserId   → 移除黑名单
 * - POST   /me/works                     → 创建作品
 * - DELETE /me/works/:workId             → 删除作品
 * - POST   /me/cancel                    → 注销账号
 * - GET    /:userId                      → 查看他人信息（排除已注销）
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const {
  formatWorkRow,
  maskPhoneNumber,
} = require('../utils/serializers');
const { loadUserWithWorks } = require('../utils/users');

const VALID_GENDERS = ['male', 'female', 'undisclosed'];

const router = express.Router();

/** 获取当前登录用户的完整信息 */
router.get('/me/complete', authenticateToken, async (req, res) => {
  await db.ready;
  const user = await loadUserWithWorks(req.auth.userId);
  if (!user) {
    res.status(404).json({ error: '未找到当前用户。' });
    return;
  }
  res.json({ user });
});

/** 更新用户资料（事务保护，含输入校验） */
router.put('/me/profile', authenticateToken, async (req, res) => {
  await db.ready;
  const current = await db.get('SELECT * FROM users WHERE id = ?', [req.auth.userId]);
  if (!current) {
    res.status(404).json({ error: '未找到当前用户。' });
    return;
  }

  const updates = [];
  const values = [];
  const now = new Date().toISOString();
  const assign = (field, value) => {
    updates.push(`${field} = ?`);
    values.push(value);
  };

  if (typeof req.body.name === 'string' && req.body.name.trim().length > 0) {
    const name = req.body.name.trim();
    if (name.length > 30) {
      res.status(400).json({ error: '昵称最多 30 个字符。' });
      return;
    }
    assign('name', name);
  }
  if (typeof req.body.avatarKey === 'string' && req.body.avatarKey.trim()) {
    assign('avatar_key', req.body.avatarKey.trim());
    assign('face_status', 'notStarted');
    assign('face_match_score', null);
    assign('face_verified_at', null);
  }
  if (typeof req.body.gender === 'string' && current.gender === 'undisclosed') {
    if (!VALID_GENDERS.includes(req.body.gender)) {
      res.status(400).json({ error: '不合法的性别值。' });
      return;
    }
    assign('gender', req.body.gender);
  }
  if (req.body.birthYear) {
    const year = Number(req.body.birthYear);
    if (!Number.isFinite(year) || year < 1900 || year > new Date().getFullYear()) {
      res.status(400).json({ error: '不合法的出生年份。' });
      return;
    }
    assign('birth_year', year);
  }
  if (req.body.birthMonth) {
    const month = Number(req.body.birthMonth);
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      res.status(400).json({ error: '不合法的出生月份。' });
      return;
    }
    assign('birth_month', month);
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

  await db.transaction(async (tx) => {
    if (updates.length > 0) {
      assign('updated_at', now);
      values.push(req.auth.userId);
      await tx.run(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
        values,
      );
    }

    if (Array.isArray(req.body.works)) {
      await tx.run('DELETE FROM user_works WHERE user_id = ?', [req.auth.userId]);
      for (const work of req.body.works) {
        await tx.run(
          `INSERT INTO user_works
           (id, user_id, type, title, summary, media_url, duration, is_pinned, review_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
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
  });

  res.json({
    user: await loadUserWithWorks(req.auth.userId),
  });
});

/** 获取隐私和通知设置 */
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

/** 更新隐私设置 */
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

/** 登录设备列表 */
router.get('/me/devices', authenticateToken, async (req, res) => {
  await db.ready;
  const devices = await db.all(
    'SELECT * FROM user_device_sessions WHERE user_id = ? ORDER BY last_seen_at DESC',
    [req.auth.userId],
  );
  res.json({ devices });
});

/** 注销指定设备会话 */
router.post('/me/devices/:deviceId/revoke', authenticateToken, async (req, res) => {
  await db.ready;
  await db.run(
    'UPDATE user_device_sessions SET status = ?, is_current = 0 WHERE id = ? AND user_id = ?',
    ['revoked', req.params.deviceId, req.auth.userId],
  );
  res.json({ success: true });
});

/** 获取黑名单列表 */
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

/** 添加黑名单（校验目标用户存在性、不能拉黑自己、不能重复） */
router.post('/me/blacklist', authenticateToken, async (req, res) => {
  await db.ready;
  const targetUserId = req.body.targetUserId;
  if (!targetUserId) {
    res.status(400).json({ error: '缺少要拉黑的用户。' });
    return;
  }
  if (targetUserId === req.auth.userId) {
    res.status(400).json({ error: '不能拉黑自己。' });
    return;
  }
  const targetUser = await db.get(
    'SELECT id FROM users WHERE id = ? AND deleted_at IS NULL',
    [targetUserId],
  );
  if (!targetUser) {
    res.status(404).json({ error: '未找到该用户。' });
    return;
  }
  const existing = await db.get(
    'SELECT id FROM chat_blacklist_entries WHERE user_id = ? AND target_user_id = ?',
    [req.auth.userId, targetUserId],
  );
  if (existing) {
    res.status(400).json({ error: '该用户已在黑名单中。' });
    return;
  }
  await db.run(
    'INSERT INTO chat_blacklist_entries (id, user_id, target_user_id, created_at) VALUES (?, ?, ?, ?)',
    [uuidv4(), req.auth.userId, targetUserId, new Date().toISOString()],
  );
  res.json({ success: true });
});

/** 从黑名单移除 */
router.delete('/me/blacklist/:targetUserId', authenticateToken, async (req, res) => {
  await db.ready;
  await db.run(
    'DELETE FROM chat_blacklist_entries WHERE user_id = ? AND target_user_id = ?',
    [req.auth.userId, req.params.targetUserId],
  );
  res.json({ success: true });
});

/** 创建用户作品 */
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

/** 注销账号（软删除，7 天冷却期） */
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

/** 查看其他用户公开信息（排除已注销用户） */
router.get('/:userId', async (req, res) => {
  await db.ready;
  const user = await db.get(
    `SELECT id, name, avatar_key, gender, birth_year, birth_month, city, signature,
            intro_video_title, intro_video_summary, membership_level, is_online, activity_score
     FROM users WHERE id = ? AND deleted_at IS NULL`,
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

module.exports = router;
