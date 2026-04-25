/**
 * 认证审核路由模块 (/api/v1/reviews)
 *
 * - GET  /summary  → 三项认证状态摘要
 * - POST /identity → 提交实名认证（事务，自动通过）
 * - POST /face     → 提交人脸认证（事务，自动通过）
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { maskIdNumber } = require('../utils/serializers');
const { loadUserWithWorks } = require('../utils/users');

const router = express.Router();

router.get('/summary', authenticateToken, async (req, res) => {
  await db.ready;
  const user = await loadUserWithWorks(req.auth.userId);
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

/** 提交实名认证（事务保护） */
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

  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO identity_verification_requests
       (id, user_id, legal_name, id_number, status, reason, created_at, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), req.auth.userId, legalName, idNumber, 'approved', '本地开发自动通过', now, now],
    );
    await tx.run(
      `UPDATE users
       SET legal_name = ?, masked_id_number = ?, identity_status = 'verified',
           identity_verified_at = ?, updated_at = ?
       WHERE id = ?`,
      [legalName, maskIdNumber(idNumber), now, now, req.auth.userId],
    );
    await tx.run(
      'INSERT INTO admin_audit_logs (id, actor_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), req.auth.userId, 'identity-review-approved', 'user', req.auth.userId, JSON.stringify({ legalName }), now],
    );
  });

  res.json({
    user: await loadUserWithWorks(req.auth.userId),
  });
});

/** 提交人脸认证（事务保护） */
router.post('/face', authenticateToken, async (req, res) => {
  await db.ready;
  const current = await db.get('SELECT avatar_key FROM users WHERE id = ?', [req.auth.userId]);
  if (!current) {
    res.status(404).json({ error: '未找到当前用户。' });
    return;
  }
  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO face_verification_requests
       (id, user_id, avatar_key, status, match_score, reason, created_at, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), req.auth.userId, current.avatar_key, 'approved', 0.986, '本地开发自动通过', now, now],
    );
    await tx.run(
      `UPDATE users
       SET face_status = 'verified', face_match_score = ?, face_verified_at = ?, updated_at = ?
       WHERE id = ?`,
      [0.986, now, now, req.auth.userId],
    );
    await tx.run(
      'INSERT INTO admin_audit_logs (id, actor_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), req.auth.userId, 'face-review-approved', 'user', req.auth.userId, JSON.stringify({ avatarKey: current.avatar_key }), now],
    );
  });

  res.json({
    user: await loadUserWithWorks(req.auth.userId),
  });
});

module.exports = router;
