const express = require('express');

const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

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
