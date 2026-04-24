/**
 * 认证审核路由模块 (/api/v1/reviews)
 *
 * 提供用户认证状态的查询和提交功能：
 * - GET  /summary  → 获取当前用户的三项认证状态摘要（手机号/实名/人脸）
 * - POST /identity → 提交实名认证（姓名 + 身份证号），本地环境自动审核通过
 * - POST /face     → 提交人脸认证，本地环境自动审核通过并给出模拟匹配分数
 *
 * 所有接口均需登录认证
 * 每次认证操作都会生成对应的审核日志（admin_audit_logs）
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { formatUserRow, formatWorkRow, maskIdNumber } = require('../utils/serializers');

const router = express.Router();

/** 获取当前用户的三项认证状态（手机号、实名、人脸） */
router.get('/summary', authenticateToken, async (req, res) => {
  await db.ready;
  const user = await loadUser(req.auth.userId);
  if (!user) {
    res.status(404).json({ error: '未找到当前用户。' });
    return;
  }
  res.json({
    summary: {
      phoneStatus: user.phoneStatus,
      identityStatus: user.identityStatus,
      faceStatus: user.faceStatus,
    },
    user,
  });
});

/**
 * 提交实名认证
 * 校验姓名和身份证号格式后，自动审核通过并更新用户认证状态
 * 同时创建认证请求记录和审计日志
 */
router.post('/identity', authenticateToken, async (req, res) => {
  await db.ready;
  const legalName = String(req.body.legalName || '').trim();
  const idNumber = String(req.body.idNumber || '').trim().toUpperCase();
  if (legalName.length < 2) {
    res.status(400).json({ error: '请输入真实姓名。' });
    return;
  }
  if (!/^\d{17}[\dX]$/.test(idNumber)) {
    res.status(400).json({ error: '请输入有效的 18 位身份证号。' });
    return;
  }
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO identity_verification_requests
     (id, user_id, legal_name, id_number, status, reason, created_at, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), req.auth.userId, legalName, idNumber, 'approved', '本地开发自动通过', now, now],
  );
  await db.run(
    `UPDATE users
     SET legal_name = ?, masked_id_number = ?, identity_status = 'verified',
         identity_verified_at = ?, updated_at = ?
     WHERE id = ?`,
    [legalName, maskIdNumber(idNumber), now, now, req.auth.userId],
  );
  await createAuditLog(req.auth.userId, 'identity-review-approved', 'user', req.auth.userId, { legalName });
  res.json({
    user: await loadUser(req.auth.userId),
  });
});

/**
 * 提交人脸认证
 * 自动审核通过，设置模拟匹配分数 0.986
 * 同时创建认证请求记录和审计日志
 */
router.post('/face', authenticateToken, async (req, res) => {
  await db.ready;
  const current = await db.get('SELECT avatar_key FROM users WHERE id = ?', [req.auth.userId]);
  if (!current) {
    res.status(404).json({ error: '未找到当前用户。' });
    return;
  }
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO face_verification_requests
     (id, user_id, avatar_key, status, match_score, reason, created_at, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), req.auth.userId, current.avatar_key, 'approved', 0.986, '本地开发自动通过', now, now],
  );
  await db.run(
    `UPDATE users
     SET face_status = 'verified', face_match_score = ?, face_verified_at = ?, updated_at = ?
     WHERE id = ?`,
    [0.986, now, now, req.auth.userId],
  );
  await createAuditLog(req.auth.userId, 'face-review-approved', 'user', req.auth.userId, { avatarKey: current.avatar_key });
  res.json({
    user: await loadUser(req.auth.userId),
  });
});

/** 加载用户信息及其关联的作品列表 */
async function loadUser(userId) {
  const row = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!row) {
    return null;
  }
  const works = await db.all(
    'SELECT * FROM user_works WHERE user_id = ? ORDER BY is_pinned DESC, created_at DESC',
    [userId],
  );
  return formatUserRow(row, works.map(formatWorkRow));
}

/** 创建管理员审计日志 */
async function createAuditLog(actorId, action, targetType, targetId, details) {
  await db.run(
    'INSERT INTO admin_audit_logs (id, actor_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [uuidv4(), actorId, action, targetType, targetId, JSON.stringify(details), new Date().toISOString()],
  );
}

module.exports = router;
