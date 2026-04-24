/**
 * 搜索路由模块 (/api/v1/search)
 *
 * 提供用户搜索功能：
 * - GET /users → 根据关键词搜索用户（匹配昵称、签名、城市）
 *   排序规则：优先在线用户，其次按活跃度降序
 *   排除当前用户自身
 *
 * 所有接口均需登录认证
 */

const express = require('express');

const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/** 搜索用户：支持按关键词模糊匹配昵称、签名、城市 */
router.get('/users', authenticateToken, async (req, res) => {
  await db.ready;
  const keyword = `%${req.query.q || ''}%`;
  const users = await db.all(
    `SELECT id, name, city, signature, avatar_key, gender, membership_level, is_online
     FROM users
     WHERE id != ? AND (name LIKE ? OR signature LIKE ? OR city LIKE ?)
     ORDER BY is_online DESC, activity_score DESC
     LIMIT 20`,
    [req.auth.userId, keyword, keyword, keyword],
  );
  res.json({ users });
});

module.exports = router;
