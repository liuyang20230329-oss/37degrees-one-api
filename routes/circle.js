const express = require('express');
const { v4: uuidv4 } = require('uuid');

const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.get('/posts', authenticateToken, async (req, res) => {
  await db.ready;
  const posts = await db.all(
    `SELECT * FROM circle_posts
     WHERE status = 'approved'
     ORDER BY created_at DESC`,
  );
  const mapped = [];
  for (const post of posts) {
    const media = await db.all(
      'SELECT media_type, url, label FROM circle_post_media WHERE post_id = ? ORDER BY sort_order ASC',
      [post.id],
    );
    mapped.push(formatPost(post, media));
  }
  res.json({ posts: mapped });
});

router.get('/posts/:postId', authenticateToken, async (req, res) => {
  await db.ready;
  const post = await db.get('SELECT * FROM circle_posts WHERE id = ?', [req.params.postId]);
  if (!post) {
    res.status(404).json({ error: '未找到该动态。' });
    return;
  }
  const media = await db.all(
    'SELECT media_type, url, label FROM circle_post_media WHERE post_id = ? ORDER BY sort_order ASC',
    [post.id],
  );
  const comments = await db.all(
    'SELECT * FROM circle_comments WHERE post_id = ? ORDER BY created_at ASC',
    [post.id],
  );
  res.json({
    post: formatPost(post, media),
    comments,
  });
});

router.post('/posts', authenticateToken, async (req, res) => {
  await db.ready;
  const currentUser = await db.get('SELECT * FROM users WHERE id = ?', [req.auth.userId]);
  if (!currentUser) {
    res.status(404).json({ error: '未找到当前用户。' });
    return;
  }
  const now = new Date().toISOString();
  const postId = uuidv4();
  await db.run(
    `INSERT INTO circle_posts
     (id, user_id, author_name, location, content, visibility, likes_count, comments_count, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      postId,
      req.auth.userId,
      currentUser.name,
      req.body.location || '未设置位置',
      req.body.content || '分享了一条新的动态。',
      req.body.visibility || 'public',
      0,
      0,
      'approved',
      now,
      now,
    ],
  );

  const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
  let sortOrder = 1;
  for (const attachment of attachments) {
    await db.run(
      'INSERT INTO circle_post_media (id, post_id, media_type, url, label, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [
        uuidv4(),
        postId,
        attachment.type || attachment.mediaType || 'image',
        attachment.url || null,
        attachment.label || attachment.note || attachment.type || '附件',
        sortOrder,
      ],
    );
    sortOrder += 1;
  }

  const post = await db.get('SELECT * FROM circle_posts WHERE id = ?', [postId]);
  const media = await db.all(
    'SELECT media_type, url, label FROM circle_post_media WHERE post_id = ? ORDER BY sort_order ASC',
    [postId],
  );
  res.status(201).json({
    post: formatPost(post, media),
  });
});

router.put('/posts/:postId', authenticateToken, async (req, res) => {
  await db.ready;
  const now = new Date().toISOString();
  await db.run(
    `UPDATE circle_posts
     SET content = ?, location = ?, visibility = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [
      req.body.content || '已更新动态内容。',
      req.body.location || '未设置位置',
      req.body.visibility || 'public',
      now,
      req.params.postId,
      req.auth.userId,
    ],
  );
  const post = await db.get('SELECT * FROM circle_posts WHERE id = ?', [req.params.postId]);
  if (!post) {
    res.status(404).json({ error: '未找到该动态。' });
    return;
  }
  const media = await db.all(
    'SELECT media_type, url, label FROM circle_post_media WHERE post_id = ? ORDER BY sort_order ASC',
    [req.params.postId],
  );
  res.json({
    post: formatPost(post, media),
  });
});

router.post('/posts/:postId/comments', authenticateToken, async (req, res) => {
  await db.ready;
  const currentUser = await db.get('SELECT name FROM users WHERE id = ?', [req.auth.userId]);
  if (!currentUser) {
    res.status(404).json({ error: '未找到当前用户。' });
    return;
  }
  const commentId = uuidv4();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO circle_comments
     (id, post_id, user_id, author_name, content, parent_comment_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      commentId,
      req.params.postId,
      req.auth.userId,
      currentUser.name,
      req.body.content || '留下一条评论。',
      req.body.parentCommentId || null,
      now,
    ],
  );
  await db.run(
    'UPDATE circle_posts SET comments_count = comments_count + 1, updated_at = ? WHERE id = ?',
    [now, req.params.postId],
  );
  res.status(201).json({ success: true, commentId });
});

router.post('/posts/:postId/reports', authenticateToken, async (req, res) => {
  await db.ready;
  await db.run(
    `INSERT INTO circle_reports
     (id, post_id, user_id, reason, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), req.params.postId, req.auth.userId, req.body.reason || '内容不适', 'pending', new Date().toISOString()],
  );
  res.status(201).json({ success: true });
});

function formatPost(post, media) {
  return {
    id: post.id,
    authorName: post.author_name,
    location: post.location,
    content: post.content,
    visibility: post.visibility,
    attachments: media.map((item) => item.label || item.media_type),
    media,
    verificationLabel: post.author_name === '北川' ? '待认证' : '真人',
    distance: `${(Math.random() * 5 + 0.5).toFixed(1)}km`,
    likes: post.likes_count,
    comments: post.comments_count,
    createdAt: post.created_at,
  };
}

module.exports = router;
