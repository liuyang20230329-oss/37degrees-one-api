/**
 * 广场路由模块 (/api/v1/square)
 *
 * - GET  /banner   → 轮播公告
 * - GET  /notices  → 系统公告
 * - GET  /users    → 推荐用户列表（分页）
 * - POST /filters  → 保存筛选条件
 * - GET  /filters  → 已保存的筛选条件
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const DEFAULT_PAGE_SIZE = 20;

const router = express.Router();

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

router.get('/notices', authenticateToken, async (req, res) => {
  await db.ready;
  const notices = await db.all(
    'SELECT * FROM system_notifications ORDER BY created_at DESC LIMIT 10',
  );
  res.json({ notices });
});

/** 推荐用户列表（分页，支持多维筛选） */
router.get('/users', authenticateToken, async (req, res) => {
  await db.ready;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  const where = ['id != ?', 'deleted_at IS NULL'];
  const params = [req.auth.userId];

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

  const [users, total] = await Promise.all([
    db.all(
      `SELECT *
       FROM users
       WHERE ${where.join(' AND ')}
       ORDER BY
         CASE WHEN face_status = 'verified' THEN 2 WHEN identity_status = 'verified' THEN 1 ELSE 0 END DESC,
         is_online DESC,
         activity_score DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    ),
    db.get(
      `SELECT COUNT(*) AS count FROM users WHERE ${where.join(' AND ')}`,
      params,
    ),
  ]);

  const mapped = users.map((row, index) => ({
    id: row.id,
    name: row.name,
    gender: row.gender,
    age: calculateAge(row.birth_year, row.birth_month),
    city: row.city,
    distance: `${(offset + index + 1) * 1.2}km`,
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

  res.json({ users: mapped, total: total.count, page, pageSize });
});

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

router.get('/filters', authenticateToken, async (req, res) => {
  await db.ready;
  const filters = await db.all(
    'SELECT * FROM saved_square_filters WHERE user_id = ? ORDER BY created_at DESC',
    [req.auth.userId],
  );
  res.json({ filters });
});

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
