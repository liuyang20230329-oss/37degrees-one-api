const express = require('express');
const { v4: uuidv4 } = require('uuid');

const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const realtime = require('../services/realtime');
const {
  formatConversationRow,
  formatMessageRow,
} = require('../utils/serializers');

const router = express.Router();

router.get('/conversations', authenticateToken, async (req, res) => {
  await db.ready;
  await ensureSeedConversations(req.auth.userId);
  const rows = await db.all(
    `SELECT * FROM chat_conversations
     WHERE user_id = ?
     ORDER BY is_pinned DESC, updated_at DESC`,
    [req.auth.userId],
  );
  res.json({
    conversations: rows.map(formatConversationRow),
  });
});

router.post('/conversations', authenticateToken, async (req, res) => {
  await db.ready;
  const now = new Date().toISOString();
  const id = uuidv4();
  await db.run(
    `INSERT INTO chat_conversations
     (id, user_id, title, subtitle, category_label, segment, last_message_preview, unread_count, is_pinned, is_online, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      req.auth.userId,
      req.body.title || '新会话',
      req.body.subtitle || '刚刚创建',
      req.body.categoryLabel || '私聊',
      req.body.segment || 'friends',
      '新的会话已经创建，可以开始聊天了。',
      1,
      0,
      1,
      now,
      now,
    ],
  );
  await db.run(
    'INSERT INTO chat_conversation_members (id, conversation_id, member_user_id, role) VALUES (?, ?, ?, ?)',
    [uuidv4(), id, req.auth.userId, 'owner'],
  );
  await db.run(
    `INSERT INTO chat_messages
     (id, conversation_id, sender_id, sender_name, text, type, delivery_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), id, 'system', '37°', '新的会话已经创建，可以开始聊天了。', 'system', 'Delivered', now],
  );

  const conversation = await db.get(
    'SELECT * FROM chat_conversations WHERE id = ?',
    [id],
  );
  realtime.pushToUser(req.auth.userId, {
    kind: 'conversation-created',
    conversationId: id,
  });
  res.status(201).json({
    conversation: formatConversationRow(conversation),
  });
});

router.patch('/conversations/:conversationId/pin', authenticateToken, async (req, res) => {
  await db.ready;
  const current = await db.get(
    'SELECT is_pinned FROM chat_conversations WHERE id = ? AND user_id = ?',
    [req.params.conversationId, req.auth.userId],
  );
  if (!current) {
    res.status(404).json({ error: '未找到该会话。' });
    return;
  }
  await db.run(
    'UPDATE chat_conversations SET is_pinned = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    [current.is_pinned ? 0 : 1, new Date().toISOString(), req.params.conversationId, req.auth.userId],
  );
  realtime.pushToUser(req.auth.userId, {
    kind: 'conversation-updated',
    conversationId: req.params.conversationId,
  });
  res.json({ success: true });
});

router.post('/conversations/read-all', authenticateToken, async (req, res) => {
  await db.ready;
  await db.run(
    'UPDATE chat_conversations SET unread_count = 0 WHERE user_id = ?',
    [req.auth.userId],
  );
  realtime.pushToUser(req.auth.userId, { kind: 'conversation-read-all' });
  res.json({ success: true });
});

router.post('/conversations/:conversationId/read', authenticateToken, async (req, res) => {
  await db.ready;
  await db.run(
    'UPDATE chat_conversations SET unread_count = 0 WHERE id = ? AND user_id = ?',
    [req.params.conversationId, req.auth.userId],
  );
  realtime.pushToUser(req.auth.userId, {
    kind: 'conversation-read',
    conversationId: req.params.conversationId,
  });
  res.json({ success: true });
});

router.delete('/conversations/:conversationId', authenticateToken, async (req, res) => {
  await db.ready;
  await db.run(
    'DELETE FROM chat_conversations WHERE id = ? AND user_id = ?',
    [req.params.conversationId, req.auth.userId],
  );
  realtime.pushToUser(req.auth.userId, {
    kind: 'conversation-deleted',
    conversationId: req.params.conversationId,
  });
  res.json({ success: true });
});

router.get('/messages/:conversationId', authenticateToken, async (req, res) => {
  await db.ready;
  const conversation = await db.get(
    'SELECT id FROM chat_conversations WHERE id = ? AND user_id = ?',
    [req.params.conversationId, req.auth.userId],
  );
  if (!conversation) {
    res.status(404).json({ error: '未找到该会话。' });
    return;
  }

  const messages = await db.all(
    `SELECT * FROM chat_messages
     WHERE conversation_id = ?
     ORDER BY created_at ASC`,
    [req.params.conversationId],
  );
  res.json({
    messages: messages.map(formatMessageRow),
  });
});

router.post('/messages', authenticateToken, async (req, res) => {
  await db.ready;
  const conversationId = req.body.conversationId;
  const text = String(req.body.text || '').trim();
  const type = req.body.type || 'text';
  const mediaUrl = req.body.mediaUrl || null;
  const metadataLabel = req.body.metadataLabel || null;

  const conversation = await db.get(
    'SELECT * FROM chat_conversations WHERE id = ? AND user_id = ?',
    [conversationId, req.auth.userId],
  );
  if (!conversation) {
    res.status(404).json({ error: '未找到该会话。' });
    return;
  }

  const currentUser = await db.get(
    'SELECT * FROM users WHERE id = ?',
    [req.auth.userId],
  );
  if (!currentUser) {
    res.status(404).json({ error: '未找到当前用户。' });
    return;
  }
  if (!isSystemConversation(conversation) && currentUser.phone_status !== 'verified') {
    res.status(403).json({ error: '请先完成手机号认证后再发起私聊。' });
    return;
  }
  if (text.length === 0) {
    res.status(400).json({ error: '消息内容不能为空。' });
    return;
  }

  const now = new Date();
  const messageId = uuidv4();
  await db.run(
    `INSERT INTO chat_messages
     (id, conversation_id, sender_id, sender_name, text, type, delivery_status, media_url, metadata_label, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      messageId,
      conversationId,
      req.auth.userId,
      currentUser.name,
      text,
      type,
      'Delivered',
      mediaUrl,
      metadataLabel,
      now.toISOString(),
    ],
  );
  await db.run(
    'UPDATE chat_conversations SET last_message_preview = ?, unread_count = 0, updated_at = ? WHERE id = ?',
    [buildPreview(type, text), now.toISOString(), conversationId],
  );

  const reply = buildAutoReply(conversationId, type);
  if (reply) {
    const replyTime = new Date(now.getTime() + 1000).toISOString();
    await db.run(
      `INSERT INTO chat_messages
       (id, conversation_id, sender_id, sender_name, text, type, delivery_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        conversationId,
        reply.senderId,
        reply.senderName,
        reply.text,
        reply.type,
        'Read',
        replyTime,
      ],
    );
    await db.run(
      'UPDATE chat_conversations SET last_message_preview = ?, unread_count = unread_count + 1, updated_at = ? WHERE id = ?',
      [buildPreview(reply.type, reply.text), replyTime, conversationId],
    );
  }

  realtime.pushToUser(req.auth.userId, {
    kind: 'message-created',
    conversationId,
  });

  const sentMessage = await db.get(
    'SELECT * FROM chat_messages WHERE id = ?',
    [messageId],
  );
  res.json({
    sentMessage: formatMessageRow(sentMessage),
  });
});

router.get('/privacy', authenticateToken, async (req, res) => {
  await db.ready;
  const settings = await db.get(
    'SELECT * FROM chat_user_privacy_settings WHERE user_id = ?',
    [req.auth.userId],
  );
  res.json({
    privacy: settings || {
      friends_only: 0,
      allow_square_exposure: 1,
      prefer_verified_users: 1,
    },
  });
});

router.put('/privacy', authenticateToken, async (req, res) => {
  await db.ready;
  await db.run(
    `INSERT OR REPLACE INTO chat_user_privacy_settings
     (user_id, friends_only, allow_square_exposure, prefer_verified_users)
     VALUES (?, ?, ?, ?)`,
    [
      req.auth.userId,
      req.body.friendsOnly ? 1 : 0,
      req.body.allowSquareExposure === false ? 0 : 1,
      req.body.preferVerifiedUsers === false ? 0 : 1,
    ],
  );
  res.json({ success: true });
});

async function ensureSeedConversations(userId) {
  const exists = await db.get(
    'SELECT id FROM chat_conversations WHERE user_id = ? LIMIT 1',
    [userId],
  );
  if (exists) {
    return;
  }

  const seeds = [
    ['concierge', '37° 向导', '认证、资料与权限提醒', '系统', 'system', 1, 1],
    ['nora', '陈诺拉', '附近的创意匹配', '私聊', 'friends', 0, 1],
    ['night-owls', '37° 观察室', '体验反馈与高信任交流', '热聊', 'hot', 0, 1],
    ['peach', '桃梨', '刚刚关注了你', '关注我的', 'followers', 0, 1],
    ['river', '小川', '你关注的摄影玩家', '我关注的', 'following', 0, 0],
  ];

  const now = Date.now();
  let index = 1;
  for (const [seedKey, title, subtitle, categoryLabel, segment, isPinned, isOnline] of seeds) {
    const conversationId = `${seedKey}-${userId}`;
    const createdAt = new Date(now - index * 60 * 1000).toISOString();
    await db.run(
      `INSERT INTO chat_conversations
       (id, user_id, title, subtitle, category_label, segment, last_message_preview, unread_count, is_pinned, is_online, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conversationId,
        userId,
        title,
        subtitle,
        categoryLabel,
        segment,
        seedPreview(seedKey),
        seedKey === 'night-owls' ? 2 : seedKey === 'concierge' ? 1 : seedKey === 'peach' ? 1 : 0,
        isPinned,
        isOnline,
        createdAt,
        createdAt,
      ],
    );
    await db.run(
      'INSERT INTO chat_conversation_members (id, conversation_id, member_user_id, role) VALUES (?, ?, ?, ?)',
      [uuidv4(), conversationId, userId, 'owner'],
    );
    await db.run(
      `INSERT INTO chat_messages
       (id, conversation_id, sender_id, sender_name, text, type, delivery_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        conversationId,
        seedKey === 'concierge' ? 'system' : `${seedKey}-member`,
        title,
        seedPreview(seedKey),
        seedKey === 'concierge' ? 'system' : 'text',
        'Read',
        createdAt,
      ],
    );
    index += 1;
  }
}

function seedPreview(seedKey) {
  switch (seedKey) {
    case 'concierge':
      return '欢迎来到 37°。你可以先完善资料和认证，也可以先在这里了解今晚的体验重点。';
    case 'nora':
      return '等你资料准备好之后，就来打个招呼吧。';
    case 'night-owls':
      return '今晚我们在收集新手引导和聊天体验的反馈。';
    case 'peach':
      return '刚看到你的语音作品，很有氛围。';
    default:
      return '我今晚会更新一组新照片，晚点来看。';
  }
}

function buildPreview(type, text) {
  if (type === 'text') {
    return text;
  }
  const labels = {
    image: '[图片]',
    voice: '[语音]',
    video: '[视频]',
    emoji: '[表情]',
    location: '[定位]',
    forwarded: '[转发]',
    system: '[系统]',
  };
  return `${labels[type] || '[消息]'} ${text}`;
}

function buildAutoReply(conversationId, type) {
  if (conversationId.startsWith('concierge-')) {
    return {
      senderId: 'system',
      senderName: '37°',
      text: `已收到你的${buildPreview(type, '').replace(/\s+$/, '')}，继续完成认证后会获得更完整的聊天权限。`,
      type: 'system',
    };
  }

  if (conversationId.startsWith('night-owls-')) {
    return {
      senderId: 'host',
      senderName: '群主',
      text: '收到，感谢你的反馈，我们正在整理这一批体验意见。',
      type: 'text',
    };
  }

  return {
    senderId: `${conversationId}-reply`,
    senderName: conversationId.startsWith('nora-') ? '陈诺拉' : '系统回复',
    text: type === 'text' ? '看到你发来的消息了，晚点继续聊。' : `我已经看到你发来的${type}内容了。`,
    type: 'text',
  };
}

function isSystemConversation(conversation) {
  return (
    conversation.segment === 'system' ||
    String(conversation.id || '').startsWith('concierge')
  );
}

module.exports = router;
