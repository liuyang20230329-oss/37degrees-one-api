const express = require('express');

const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

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

router.get('/banners', authenticateToken, async (req, res) => {
  await db.ready;
  const banners = await db.all(
    'SELECT * FROM square_banner_items ORDER BY sort_order ASC',
  );
  res.json({ banners });
});

router.get('/logs', authenticateToken, async (req, res) => {
  await db.ready;
  const logs = await db.all(
    'SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT 100',
  );
  res.json({ logs });
});

module.exports = router;
