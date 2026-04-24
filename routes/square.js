/**
 * 广场路由模块 (/api/v1/square)
 *
 * 提供广场（推荐发现页）的浏览和筛选功能：
 * - GET  /banner   → 获取广场轮播公告列表
 * - GET  /notices  → 获取系统公告通知
 * - GET  /users    → 获取推荐用户列表（支持多维度筛选）
 * - POST /filters  → 保存筛选条件
 * - GET  /filters  → 获取已保存的筛选条件
 *
 * 推荐用户排序逻辑：
 * 1. 人脸已认证 > 实名已认证 > 未认证
 * 2. 在线优先
 * 3. 活跃度降序
 *
 * 所有接口均需登录认证
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/** 获取广场轮播公告（仅活跃状态） */
router.get('/banner', authenticateToken, async (req, res) => {
  await db.ready;
  const items = await db.all(
    `SELECT id, title, description
     FROM square_banner_items
     WHERE status = 'active'
     ORDER BY sort_order ASC`,
  );
  res.json({ items });
});

/** 获取系统公告通知（最近 10 条） */
router.get('/notices', authenticateToken, async (req, res) => {
  await db.ready;
  const notices = await db.all(
    'SELECT * FROM system_notifications ORDER BY created_at DESC LIMIT 10',
  );
  res.json({ notices });
});

/**
 * 获取推荐用户列表
 * 支持的筛选参数：region（地区）、gender（性别）、membershipLevel（会员等级）、
 *               verifiedOnly（仅已认证）、onlineOnly（仅在线）、search（关键词搜索）
 * 排序：认证状态 > 在线状态 > 活跃度
 */
router.get('/users', authenticateToken, async (req, res) => {
  await db.ready;
  const where = ['id != ?'];
  const params = [req.auth.userId];

  /* 动态拼接筛选条件 */
  if (req.query.region) {
    where.push('city = ?');
    params.push(req.query.region);
  }
  if (req.query.gender) {
    where.push('gender = ?');
    params.push(req.query.gender);
  }
  if (req.query.membershipLevel) {
    where.push('membership_level = ?');
    params.push(req.query.membershipLevel);
  }
  if (req.query.verifiedOnly === 'true') {
    where.push("face_status = 'verified'");
  }
  if (req.query.onlineOnly === 'true') {
    where.push('is_online = 1');
  }
  if (req.query.search) {
    where.push('(name LIKE ? OR signature LIKE ?)');
    params.push(`%${req.query.search}%`, `%${req.query.search}%`);
  }

  const users = await db.all(
    `SELECT *
     FROM users
     WHERE ${where.join(' AND ')}
     ORDER BY
       CASE WHEN face_status = 'verified' THEN 2 WHEN identity_status = 'verified' THEN 1 ELSE 0 END DESC,
       is_online DESC,
       activity_score DESC`,
    params,
  );

  /* 格式化输出，附加计算字段（年龄、距离、标签、信任等级） */
  const mapped = users.map((row, index) => ({
    id: row.id,
    name: row.name,
    gender: row.gender,
    age: calculateAge(row.birth_year, row.birth_month),
    city: row.city,
    distance: `${(index + 1) * 1.2}km`,
    signature: row.signature,
    tags: buildTags(row),
    trustLabel: row.face_status === 'verified'
      ? '真人'
      : row.identity_status === 'verified'
        ? '实名'
        : '待认证',
    isVerified: row.face_status === 'verified',
    isOnline: Boolean(row.is_online),
    membershipLevel: row.membership_level,
  }));

  res.json({ users: mapped });
});

/** 保存筛选条件（用户可自定义筛选组合） */
router.post('/filters', authenticateToken, async (req, res) => {
  await db.ready;
  const id = uuidv4();
  await db.run(
    `INSERT INTO saved_square_filters
     (id, user_id, name, region, age_range, gender, membership_level, verified_only, online_only, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      req.auth.userId,
      req.body.name || '默认筛选',
      req.body.region || null,
      req.body.ageRange || null,
      req.body.gender || null,
      req.body.membershipLevel || null,
      req.body.verifiedOnly ? 1 : 0,
      req.body.onlineOnly ? 1 : 0,
      new Date().toISOString(),
    ],
  );
  res.status(201).json({ success: true, filterId: id });
});

/** 获取当前用户已保存的筛选条件列表 */
router.get('/filters', authenticateToken, async (req, res) => {
  await db.ready;
  const filters = await db.all(
    'SELECT * FROM saved_square_filters WHERE user_id = ? ORDER BY created_at DESC',
    [req.auth.userId],
  );
  res.json({ filters });
});

/** 根据出生年月计算年龄 */
function calculateAge(year, month) {
  if (!year || !month) {
    return null;
  }
  const now = new Date();
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month) {
    age -= 1;
  }
  return age;
}

/** 根据用户状态构建标签数组（真人、高热度、在线、偏好） */
function buildTags(row) {
  const tags = [];
  if (row.face_status === 'verified') {
    tags.push('真人');
  }
  if (row.membership_level === 'vip' || row.membership_level === 'gold') {
    tags.push('高热度');
  }
  if (row.is_online) {
    tags.push('在线');
  }
  tags.push(row.gender === 'female' ? '视频' : '语音');
  return tags;
}

module.exports = router;
