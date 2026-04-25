/**
 * 通知路由模块 (/api/v1/notifications)
 *
 * - GET /                     → 通知列表（分页）
 * - PUT /:notificationId/read → 标记已读
 * - PUT /read-all             → 全部已读
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/** 获取通知列表（分页） */
router.get('/', authenticateToken, async (req, res) => {
  await db.ready;
  await ensureUserNotifications(req.auth.userId);

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const [notifications, total] = await Promise.all([
    db.all(
      'SELECT * FROM user_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [req.auth.userId, pageSize, offset],
    ),
    db.get(
      'SELECT COUNT(*) AS count FROM user_notifications WHERE user_id = ?',
      [req.auth.userId],
    ),
  ]);
  res.json({ notifications, total: total.count, page, pageSize });
});

router.put('/:notificationId/read', authenticateToken, async (req, res) => {
  await db.ready;
  await db.run(
    'UPDATE user_notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    [req.params.notificationId, req.auth.userId],
  );
  res.json({ success: true });
});

router.put('/read-all', authenticateToken, async (req, res) => {
  await db.ready;
  await db.run(
    'UPDATE user_notifications SET is_read = 1 WHERE user_id = ?',
    [req.auth.userId],
  );
  res.json({ success: true });
});

async function ensureUserNotifications(userId) {
  const existing = await db.get(
    'SELECT id FROM user_notifications WHERE user_id = ? LIMIT 1',
    [userId],
  );
  if (existing) {
    return;
  }
  const now = new Date().toISOString();
  const seeds = [
    ['欢迎来到 37°', '你可以先完善资料，再开启文字、语音和视频社交。', 'system'],
    ['认证提醒', '完成本人认证后，你在广场和圈子的曝光会更稳定。', 'review'],
    ['聊天提示', '完成手机号认证后，可正式发起和回复私聊。', 'chat'],
  ];
  for (const [title, content, kind] of seeds) {
    await db.run(
      'INSERT INTO user_notifications (id, user_id, title, content, kind, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), userId, title, content, kind, 0, now],
    );
  }
}

module.exports = router;
