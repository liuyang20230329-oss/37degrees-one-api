/**
 * 管理后台路由模块 (/api/v1/admin)
 *
 * 提供管理后台所需的数据查询接口（全部需要管理员权限）：
 * - GET /dashboard   → 仪表盘概览
 * - GET /users       → 用户列表（支持分页）
 * - GET /reviews     → 审核请求列表
 * - GET /banners     → 轮播公告列表
 * - GET /logs        → 操作审计日志（支持分页）
 */

const express = require('express');

const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * 管理员权限校验中间件
 * 检查当前用户是否在 admin_users 表中有 active 记录
 */
async function requireAdmin(req, res, next) {
  const adminUser = await db.get(
    `SELECT au.id FROM admin_users au
     WHERE au.user_id = ? AND au.status = 'active'`,
    [req.auth.userId],
  );
  if (!adminUser) {
    res.status(403).json({ error: '无管理员权限。' });
    return;
  }
  next();
}

/** 仪表盘数据：并行查询用户数、认证统计、动态数、未读通知数 */
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  await db.ready;
  const [users, reviews, posts, unreadNotifications] = await Promise.all([
    db.get('SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL'),
    db.get(
      `SELECT
         SUM(CASE WHEN identity_status = 'verified' THEN 1 ELSE 0 END) AS identityApproved,
         SUM(CASE WHEN face_status = 'verified' THEN 1 ELSE 0 END) AS faceApproved
       FROM users`,
    ),
    db.get('SELECT COUNT(*) AS count FROM circle_posts'),
    db.get('SELECT COUNT(*) AS count FROM user_notifications WHERE is_read = 0'),
  ]);
  res.json({
    metrics: {
      users: users.count,
      identityApproved: reviews.identityApproved,
      faceApproved: reviews.faceApproved,
      posts: posts.count,
      unreadNotifications: unreadNotifications.count,
    },
  });
});

/** 查询所有未删除的用户列表（支持分页，每页 20 条） */
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  await db.ready;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const [users, total] = await Promise.all([
    db.all(
      `SELECT id, name, phone_number, phone_status, identity_status, face_status, city, membership_level, is_online, created_at
       FROM users
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [pageSize, offset],
    ),
    db.get('SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL'),
  ]);
  res.json({ users, total: total.count, page, pageSize });
});

/** 查询待审核的实名认证和人脸认证请求（各最近 50 条） */
router.get('/reviews', authenticateToken, requireAdmin, async (req, res) => {
  await db.ready;
  const [identityRequests, faceRequests] = await Promise.all([
    db.all(
      'SELECT * FROM identity_verification_requests ORDER BY created_at DESC LIMIT 50',
    ),
    db.all(
      'SELECT * FROM face_verification_requests ORDER BY created_at DESC LIMIT 50',
    ),
  ]);
  res.json({
    identityRequests,
    faceRequests,
  });
});

/** 查询广场轮播公告列表 */
router.get('/banners', authenticateToken, requireAdmin, async (req, res) => {
  await db.ready;
  const banners = await db.all(
    'SELECT * FROM square_banner_items ORDER BY sort_order ASC',
  );
  res.json({ banners });
});

/** 查询管理员操作审计日志（支持分页） */
router.get('/logs', authenticateToken, requireAdmin, async (req, res) => {
  await db.ready;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const [logs, total] = await Promise.all([
    db.all(
      'SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [pageSize, offset],
    ),
    db.get('SELECT COUNT(*) AS count FROM admin_audit_logs'),
  ]);
  res.json({ logs, total: total.count, page, pageSize });
});

module.exports = router;
