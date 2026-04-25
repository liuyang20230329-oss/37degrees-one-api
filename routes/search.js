/**
 * 搜索路由模块 (/api/v1/search)
 *
 * - GET /users → 搜索用户（分页）
 */

const express = require('express');

const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/** 搜索用户（支持分页，排除自己，按在线+活跃度排序） */
router.get('/users', authenticateToken, async (req, res) => {
  await db.ready;
  const keyword = `%${req.query.q || ''}%`;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const [users, total] = await Promise.all([
    db.all(
      `SELECT id, name, city, signature, avatar_key, gender, membership_level, is_online
       FROM users
       WHERE id != ? AND deleted_at IS NULL AND (name LIKE ? OR signature LIKE ? OR city LIKE ?)
       ORDER BY is_online DESC, activity_score DESC
       LIMIT ? OFFSET ?`,
      [req.auth.userId, keyword, keyword, keyword, pageSize, offset],
    ),
    db.get(
      `SELECT COUNT(*) AS count FROM users
       WHERE id != ? AND deleted_at IS NULL AND (name LIKE ? OR signature LIKE ? OR city LIKE ?)`,
      [req.auth.userId, keyword, keyword, keyword],
    ),
  ]);
  res.json({ users, total: total.count, page, pageSize });
});

module.exports = router;
