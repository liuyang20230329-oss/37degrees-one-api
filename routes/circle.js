/**
 * 圈子动态路由模块 (/api/v1/circle)
 *
 * - GET    /posts                   → 获取已审核通过的动态列表（分页，批量加载媒体）
 * - GET    /posts/:postId           → 获取单条动态详情
 * - POST   /posts                   → 发布新动态（事务保护）
 * - PUT    /posts/:postId           → 更新动态内容
 * - DELETE /posts/:postId           → 删除动态（仅限本人）
 * - POST   /posts/:postId/like      → 点赞动态
 * - POST   /posts/:postId/unlike    → 取消点赞
 * - POST   /posts/:postId/comments  → 发表评论
 * - POST   /posts/:postId/reports   → 举报动态
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const VALID_VISIBILITIES = ['public', 'friends', 'private'];
const MAX_CONTENT_LENGTH = 2000;
const MAX_COMMENT_LENGTH = 500;
const DEFAULT_PAGE_SIZE = 20;

const router = express.Router();

/** 获取已审核通过的动态列表（批量加载媒体，消除 N+1） */
router.get('/posts', authenticateToken, async (req, res) => {
  await db.ready;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  const [posts, total] = await Promise.all([
    db.all(
      `SELECT * FROM circle_posts
       WHERE status = 'approved'
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [pageSize, offset],
    ),
    db.get("SELECT COUNT(*) AS count FROM circle_posts WHERE status = 'approved'"),
  ]);

  const postIds = posts.map((p) => p.id);
  const allMedia = postIds.length > 0
    ? await db.all(
        `SELECT * FROM circle_post_media WHERE post_id IN (${postIds.map(() => '?').join(', ')}) ORDER BY sort_order ASC`,
        postIds,
      )
    : [];

  const mediaByPostId = new Map();
  for (const m of allMedia) {
    if (!mediaByPostId.has(m.post_id)) {
      mediaByPostId.set(m.post_id, []);
    }
    mediaByPostId.get(m.post_id).push(m);
  }

  const mapped = posts.map((post) => formatPost(post, mediaByPostId.get(post.id) || []));
  res.json({ posts: mapped, total: total.count, page, pageSize });
});

/** 获取单条动态详情（含评论列表） */
router.get('/posts/:postId', authenticateToken, async (req, res) => {
  await db.ready;
  const post = await db.get('SELECT * FROM circle_posts WHERE id = ?', [req.params.postId]);
  if (!post) {
    res.status(404).json({ error: '未找到该动态。' });
    return;
  }
  const [media, comments] = await Promise.all([
    db.all(
      'SELECT * FROM circle_post_media WHERE post_id = ? ORDER BY sort_order ASC',
      [post.id],
    ),
    db.all(
      'SELECT * FROM circle_comments WHERE post_id = ? ORDER BY created_at ASC',
      [post.id],
    ),
  ]);
  res.json({
    post: formatPost(post, media),
    comments,
  });
});

/** 发布新动态（事务保护，校验输入） */
router.post('/posts', authenticateToken, async (req, res) => {
  await db.ready;
  const currentUser = await db.get('SELECT * FROM users WHERE id = ?', [req.auth.userId]);
  if (!currentUser) {
    res.status(404).json({ error: '未找到当前用户。' });
    return;
  }
  const content = req.body.content || '分享了一条新的动态。';
  if (content.length > MAX_CONTENT_LENGTH) {
    res.status(400).json({ error: `动态内容不能超过 ${MAX_CONTENT_LENGTH} 个字符。` });
    return;
  }
  const visibility = req.body.visibility || 'public';
  if (!VALID_VISIBILITIES.includes(visibility)) {
    res.status(400).json({ error: '不合法的可见性设置。' });
    return;
  }

  const now = new Date().toISOString();
  const postId = uuidv4();
  const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];

  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO circle_posts
       (id, user_id, author_name, location, content, visibility, likes_count, comments_count, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        postId,
        req.auth.userId,
        currentUser.name,
        req.body.location || '未设置位置',
        content,
        visibility,
        0,
        0,
        'approved',
        now,
        now,
      ],
    );

    let sortOrder = 1;
    for (const attachment of attachments) {
      await tx.run(
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
  });

  const post = await db.get('SELECT * FROM circle_posts WHERE id = ?', [postId]);
  const media = await db.all(
    'SELECT * FROM circle_post_media WHERE post_id = ? ORDER BY sort_order ASC',
    [postId],
  );
  res.status(201).json({
    post: formatPost(post, media),
  });
});

/** 更新动态内容（先校验存在性和权限，再更新） */
router.put('/posts/:postId', authenticateToken, async (req, res) => {
  await db.ready;
  const existing = await db.get(
    'SELECT id FROM circle_posts WHERE id = ? AND user_id = ?',
    [req.params.postId, req.auth.userId],
  );
  if (!existing) {
    res.status(404).json({ error: '未找到该动态或无权编辑。' });
    return;
  }
  const content = req.body.content || '已更新动态内容。';
  if (content.length > MAX_CONTENT_LENGTH) {
    res.status(400).json({ error: `动态内容不能超过 ${MAX_CONTENT_LENGTH} 个字符。` });
    return;
  }
  const visibility = req.body.visibility || 'public';
  if (!VALID_VISIBILITIES.includes(visibility)) {
    res.status(400).json({ error: '不合法的可见性设置。' });
    return;
  }

  const now = new Date().toISOString();
  await db.run(
    `UPDATE circle_posts
     SET content = ?, location = ?, visibility = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [
      content,
      req.body.location || '未设置位置',
      visibility,
      now,
      req.params.postId,
      req.auth.userId,
    ],
  );
  const post = await db.get('SELECT * FROM circle_posts WHERE id = ?', [req.params.postId]);
  const media = await db.all(
    'SELECT * FROM circle_post_media WHERE post_id = ? ORDER BY sort_order ASC',
    [req.params.postId],
  );
  res.json({
    post: formatPost(post, media),
  });
});

/** 删除动态（仅限本人操作） */
router.delete('/posts/:postId', authenticateToken, async (req, res) => {
  await db.ready;
  const existing = await db.get(
    'SELECT id FROM circle_posts WHERE id = ? AND user_id = ?',
    [req.params.postId, req.auth.userId],
  );
  if (!existing) {
    res.status(404).json({ error: '未找到该动态或无权删除。' });
    return;
  }
  await db.run(
    'DELETE FROM circle_posts WHERE id = ? AND user_id = ?',
    [req.params.postId, req.auth.userId],
  );
  res.json({ success: true });
});

/** 点赞动态 */
router.post('/posts/:postId/like', authenticateToken, async (req, res) => {
  await db.ready;
  const post = await db.get('SELECT id FROM circle_posts WHERE id = ?', [req.params.postId]);
  if (!post) {
    res.status(404).json({ error: '未找到该动态。' });
    return;
  }
  await db.run(
    'UPDATE circle_posts SET likes_count = likes_count + 1, updated_at = ? WHERE id = ?',
    [new Date().toISOString(), req.params.postId],
  );
  res.json({ success: true });
});

/** 取消点赞 */
router.post('/posts/:postId/unlike', authenticateToken, async (req, res) => {
  await db.ready;
  const post = await db.get('SELECT likes_count FROM circle_posts WHERE id = ?', [req.params.postId]);
  if (!post) {
    res.status(404).json({ error: '未找到该动态。' });
    return;
  }
  if (post.likes_count > 0) {
    await db.run(
      'UPDATE circle_posts SET likes_count = likes_count - 1, updated_at = ? WHERE id = ?',
      [new Date().toISOString(), req.params.postId],
    );
  }
  res.json({ success: true });
});

/** 发表评论（校验内容长度和 postId 存在性） */
router.post('/posts/:postId/comments', authenticateToken, async (req, res) => {
  await db.ready;
  const post = await db.get('SELECT id FROM circle_posts WHERE id = ?', [req.params.postId]);
  if (!post) {
    res.status(404).json({ error: '未找到该动态。' });
    return;
  }
  const currentUser = await db.get('SELECT name FROM users WHERE id = ?', [req.auth.userId]);
  if (!currentUser) {
    res.status(404).json({ error: '未找到当前用户。' });
    return;
  }
  const content = req.body.content || '留下一条评论。';
  if (content.length > MAX_COMMENT_LENGTH) {
    res.status(400).json({ error: `评论不能超过 ${MAX_COMMENT_LENGTH} 个字符。` });
    return;
  }
  if (req.body.parentCommentId) {
    const parent = await db.get(
      'SELECT id FROM circle_comments WHERE id = ? AND post_id = ?',
      [req.body.parentCommentId, req.params.postId],
    );
    if (!parent) {
      res.status(400).json({ error: '回复的评论不存在。' });
      return;
    }
  }

  const commentId = uuidv4();
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO circle_comments
       (id, post_id, user_id, author_name, content, parent_comment_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [commentId, req.params.postId, req.auth.userId, currentUser.name, content, req.body.parentCommentId || null, now],
    );
    await tx.run(
      'UPDATE circle_posts SET comments_count = comments_count + 1, updated_at = ? WHERE id = ?',
      [now, req.params.postId],
    );
  });
  res.status(201).json({ success: true, commentId });
});

/** 举报动态（校验 postId 存在性） */
router.post('/posts/:postId/reports', authenticateToken, async (req, res) => {
  await db.ready;
  const post = await db.get('SELECT id FROM circle_posts WHERE id = ?', [req.params.postId]);
  if (!post) {
    res.status(404).json({ error: '未找到该动态。' });
    return;
  }
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
