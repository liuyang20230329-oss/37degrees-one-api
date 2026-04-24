/**
 * 管理后台路由模块 (/api/v1/admin)
 *
 * 提供管理后台所需的数据查询接口：
 * - GET /dashboard   → 仪表盘概览（用户总数、认证通过数、动态总数、未读通知数）
 * - GET /users       → 用户列表查询
 * - GET /reviews     → 审核/认证请求列表（实名认证 + 人脸认证）
 * - GET /banners     → 广场轮播公告列表
 * - GET /logs        → 管理员操作审计日志
 *
 * 所有接口均需登录认证（authenticateToken 中间件）
 */

const express = require('express');

const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/** 仪表盘数据：并行查询用户数、认证统计、动态数、未读通知数 */
router.get('/dashboard', authenticateToken, async (req, res) => {
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

/** 查询所有未删除的用户列表（关键状态字段） */
router.get('/users', authenticateToken, async (req, res) => {
  await db.ready;
  const users = await db.all(
    `SELECT id, name, phone_number, phone_status, identity_status, face_status, city, membership_level, is_online, created_at
     FROM users
     WHERE deleted_at IS NULL
     ORDER BY created_at DESC`,
  );
  res.json({ users });
});

/** 查询待审核的实名认证和人脸认证请求（各最近 50 条） */
router.get('/reviews', authenticateToken, async (req, res) => {
  await db.ready;
  const identityRequests = await db.all(
    'SELECT * FROM identity_verification_requests ORDER BY created_at DESC LIMIT 50',
  );
  const faceRequests = await db.all(
    'SELECT * FROM face_verification_requests ORDER BY created_at DESC LIMIT 50',
  );
  res.json({
    identityRequests,
    faceRequests,
  });
});

/** 查询广场轮播公告列表（按排序权重升序） */
router.get('/banners', authenticateToken, async (req, res) => {
  await db.ready;
  const banners = await db.all(
    'SELECT * FROM square_banner_items ORDER BY sort_order ASC',
  );
  res.json({ banners });
});

/** 查询管理员操作审计日志（最近 100 条） */
router.get('/logs', authenticateToken, async (req, res) => {
  await db.ready;
  const logs = await db.all(
    'SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT 100',
  );
  res.json({ logs });
});

module.exports = router;
