const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

class SqliteStore {
  constructor() {
    this.dbPath = resolveDbPath(process.env.DB_PATH);
    this.db = null;
    this.ready = this.initialize();
  }

  async initialize() {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    await this._open();
    await this.exec('PRAGMA foreign_keys = ON;');
    const shouldReset = await this._needsReset();
    if (shouldReset) {
      await this.close();
      const backupPath = this.dbPath.replace('.db', `.legacy-${Date.now()}.db`);
      fs.renameSync(this.dbPath, backupPath);
      await this._open();
      await this.exec('PRAGMA foreign_keys = ON;');
    }
    await this.exec(schemaSql);
    await this.seed();
  }

  async _open() {
    this.db = await new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(db);
      });
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function onRun(error) {
        if (error) {
          reject(error);
          return;
        }
        resolve({
          lastID: this.lastID,
          changes: this.changes,
        });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (error, row) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(row || null);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (error, rows) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  exec(sql) {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async close() {
    if (!this.db) {
      return;
    }
    await new Promise((resolve, reject) => {
      this.db.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.db = null;
  }

  async _needsReset() {
    const usersTable = await this.get(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'",
    );
    if (!usersTable) {
      return false;
    }
    const columns = await this.all('PRAGMA table_info(users)');
    const columnNames = new Set(columns.map((column) => column.name));
    return !columnNames.has('password_hash') || !columnNames.has('phone_status');
  }

  async seed() {
    const existingBanner = await this.get(
      'SELECT id FROM square_banner_items LIMIT 1',
    );
    if (existingBanner) {
      return;
    }

    const now = new Date().toISOString();
    const seedUsers = [
      {
        id: 'seed-user-linwu',
        name: '林雾',
        phoneNumber: '13910000001',
        gender: 'female',
        birthYear: 2003,
        birthMonth: 7,
        city: '上海',
        signature: '喜欢电影、手账和夜晚慢慢聊天。',
        introVideoTitle: '夜风介绍片',
        introVideoSummary: '想认识真诚、耐心、会表达的人。',
        avatarKey: 'sunset',
        membershipLevel: 'gold',
        isOnline: 1,
        activityScore: 97,
        phoneStatus: 'verified',
        identityStatus: 'verified',
        faceStatus: 'verified',
        maskedPhoneNumber: '139****0001',
        legalName: '林雾',
        maskedIdNumber: '3101********1208',
        faceMatchScore: 0.989,
      },
      {
        id: 'seed-user-aze',
        name: '阿泽',
        phoneNumber: '13910000002',
        gender: 'male',
        birthYear: 2000,
        birthMonth: 10,
        city: '杭州',
        signature: '最近在找一起连麦打游戏和聊音乐的人。',
        introVideoTitle: '夜跑后说两句',
        introVideoSummary: '偏向语音和视频社交。',
        avatarKey: 'ember',
        membershipLevel: 'silver',
        isOnline: 1,
        activityScore: 90,
        phoneStatus: 'verified',
        identityStatus: 'verified',
        faceStatus: 'pending',
        maskedPhoneNumber: '139****0002',
        legalName: '陈泽',
        maskedIdNumber: '3301********4312',
        faceMatchScore: null,
      },
      {
        id: 'seed-user-ruomeng',
        name: '若梦',
        phoneNumber: '13910000003',
        gender: 'female',
        birthYear: 1998,
        birthMonth: 6,
        city: '苏州',
        signature: '喜欢摄影、旅行，也想认识更多有趣灵魂。',
        introVideoTitle: '旅行短片',
        introVideoSummary: '偏好图文和短视频表达。',
        avatarKey: 'lagoon',
        membershipLevel: 'vip',
        isOnline: 0,
        activityScore: 88,
        phoneStatus: 'verified',
        identityStatus: 'verified',
        faceStatus: 'verified',
        maskedPhoneNumber: '139****0003',
        legalName: '秦若梦',
        maskedIdNumber: '3205********5501',
        faceMatchScore: 0.981,
      },
      {
        id: 'seed-user-beichuan',
        name: '北川',
        phoneNumber: '13910000004',
        gender: 'male',
        birthYear: 2005,
        birthMonth: 11,
        city: '南京',
        signature: '想找可以一起语音、一起散步的人。',
        introVideoTitle: '认识我一下',
        introVideoSummary: '先从文字聊天开始也很好。',
        avatarKey: 'graphite',
        membershipLevel: 'standard',
        isOnline: 1,
        activityScore: 75,
        phoneStatus: 'notStarted',
        identityStatus: 'notStarted',
        faceStatus: 'notStarted',
        maskedPhoneNumber: '139****0004',
        legalName: null,
        maskedIdNumber: null,
        faceMatchScore: null,
      },
    ];

    const defaultPasswordHash = bcrypt.hashSync('Password123!', 10);
    for (const user of seedUsers) {
      await this.run(
        `INSERT INTO users (
          id, name, email, phone_number, password_hash, avatar_key, gender,
          birth_year, birth_month, city, signature, intro_video_title,
          intro_video_summary, phone_status, identity_status, face_status,
          masked_phone_number, legal_name, masked_id_number, face_match_score,
          membership_level, is_online, activity_score, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          user.name,
          `${user.phoneNumber}@37degrees.local`,
          user.phoneNumber,
          defaultPasswordHash,
          user.avatarKey,
          user.gender,
          user.birthYear,
          user.birthMonth,
          user.city,
          user.signature,
          user.introVideoTitle,
          user.introVideoSummary,
          user.phoneStatus,
          user.identityStatus,
          user.faceStatus,
          user.maskedPhoneNumber,
          user.legalName,
          user.maskedIdNumber,
          user.faceMatchScore,
          user.membershipLevel,
          user.isOnline,
          user.activityScore,
          now,
          now,
        ],
      );
    }

    const banners = [
      ['banner-auth', '37° 广场正在更新可信推荐', '先看推荐卡片，再决定是否继续聊天、语音或见面认识。', 1],
      ['banner-trust', '认证越完整，曝光越稳定', '手机号、实名和本人认证会共同影响推荐顺位与展示权重。', 2],
      ['banner-profile', '资料越完整，越容易被认真看见', '完善视频介绍、作品和个性签名，会更容易获得高质量回应。', 3],
    ];
    for (const [id, title, description, sortOrder] of banners) {
      await this.run(
        'INSERT INTO square_banner_items (id, title, description, sort_order, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, title, description, sortOrder, 'active', now],
      );
    }

    const notices = [
      ['notice-1', '平台通知', '今日推荐优先展示资料完整、活跃度高、认证更充分的用户。', 'square', 'high'],
      ['notice-2', '系统提醒', '圈子动态支持文案、定位、图片、语音、动图和网址。', 'circle', 'normal'],
      ['notice-3', '版本更新', '消息页已支持分组、红点和置顶联动。', 'chat', 'normal'],
    ];
    for (const [id, title, content, kind, priority] of notices) {
      await this.run(
        'INSERT INTO system_notifications (id, title, content, kind, priority, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, title, content, kind, priority, now],
      );
    }

    const posts = [
      {
        id: 'circle-1',
        userId: 'seed-user-linwu',
        authorName: '林雾',
        location: '上海·徐汇',
        content: '今晚在武康路散步，拍到了很舒服的夜景，想找人一起语音聊聊天。',
        visibility: 'public',
        media: [
          ['image', '/uploads/sample-wukang.jpg', '夜景图'],
          ['location', '', '徐汇'],
        ],
      },
      {
        id: 'circle-2',
        userId: 'seed-user-aze',
        authorName: '阿泽',
        location: '杭州·西湖',
        content: '刚录了一段晚安语音，适合睡前听，欢迎来圈子里互动。',
        visibility: 'public',
        media: [
          ['voice', '/uploads/sample-goodnight.mp3', '晚安语音'],
        ],
      },
      {
        id: 'circle-3',
        userId: 'seed-user-ruomeng',
        authorName: '若梦',
        location: '苏州·园区',
        content: '整理了一组适合破冰聊天的动图和链接，今天先放一部分。',
        visibility: 'public',
        media: [
          ['gif', '/uploads/sample-icebreak.gif', '破冰动图'],
          ['link', 'https://example.com/icebreak', '聊天开场链接'],
        ],
      },
    ];

    for (const post of posts) {
      await this.run(
        'INSERT INTO circle_posts (id, user_id, author_name, location, content, visibility, likes_count, comments_count, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [post.id, post.userId, post.authorName, post.location, post.content, post.visibility, 12, 3, 'approved', now, now],
      );
      let sortOrder = 1;
      for (const media of post.media) {
        await this.run(
          'INSERT INTO circle_post_media (id, post_id, media_type, url, label, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
          [uuidv4(), post.id, media[0], media[1], media[2], sortOrder],
        );
        sortOrder += 1;
      }
    }

    const roles = [
      ['role-super-admin', '超级管理员'],
      ['role-ops-admin', '运营管理员'],
      ['role-reviewer', '审核专员'],
      ['role-support', '客服专员'],
      ['role-analyst', '数据分析人员'],
    ];
    for (const [id, name] of roles) {
      await this.run(
        'INSERT INTO admin_roles (id, name) VALUES (?, ?)',
        [id, name],
      );
    }
  }
}

function resolveDbPath(value) {
  const defaultPath = path.join(__dirname, '..', 'data', '37degrees-v2.db');
  if (!value || value.trim().length === 0) {
    return defaultPath;
  }

  const normalized = value.replace(/\\/g, '/').trim();
  if (
    normalized === './data/37degrees.db' ||
    normalized === 'data/37degrees.db' ||
    normalized.endsWith('/data/37degrees.db')
  ) {
    return defaultPath;
  }

  return path.isAbsolute(value)
    ? value
    : path.resolve(__dirname, '..', value);
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone_number TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar_key TEXT DEFAULT 'aurora',
  gender TEXT DEFAULT 'undisclosed',
  birth_year INTEGER,
  birth_month INTEGER,
  city TEXT,
  signature TEXT,
  intro_video_title TEXT,
  intro_video_summary TEXT,
  phone_status TEXT DEFAULT 'notStarted',
  identity_status TEXT DEFAULT 'notStarted',
  face_status TEXT DEFAULT 'notStarted',
  masked_phone_number TEXT,
  legal_name TEXT,
  masked_id_number TEXT,
  face_match_score REAL,
  phone_verified_at TEXT,
  identity_verified_at TEXT,
  face_verified_at TEXT,
  membership_level TEXT DEFAULT 'standard',
  is_online INTEGER DEFAULT 0,
  activity_score INTEGER DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sms_codes (
  id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_social_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_uid TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_device_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  ip_address TEXT,
  status TEXT NOT NULL,
  is_current INTEGER DEFAULT 0,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS identity_verification_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  id_number TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS face_verification_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  avatar_key TEXT,
  status TEXT NOT NULL,
  match_score REAL,
  reason TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS content_review_records (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS user_works (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  media_url TEXT,
  duration INTEGER,
  is_pinned INTEGER DEFAULT 0,
  review_status TEXT DEFAULT 'approved',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  category_label TEXT NOT NULL,
  segment TEXT NOT NULL,
  last_message_preview TEXT,
  unread_count INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  is_online INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_conversation_members (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  member_user_id TEXT,
  role TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  text TEXT NOT NULL,
  type TEXT NOT NULL,
  delivery_status TEXT NOT NULL,
  media_url TEXT,
  metadata_label TEXT,
  is_recalled INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  attachment_type TEXT NOT NULL,
  url TEXT,
  label TEXT,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_message_receipts (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_message_actions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  operator_user_id TEXT NOT NULL,
  target_conversation_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_user_privacy_settings (
  user_id TEXT PRIMARY KEY,
  friends_only INTEGER DEFAULT 0,
  allow_square_exposure INTEGER DEFAULT 1,
  prefer_verified_users INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_blacklist_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS circle_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  location TEXT,
  content TEXT NOT NULL,
  visibility TEXT NOT NULL,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS circle_post_media (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  media_type TEXT NOT NULL,
  url TEXT,
  label TEXT,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (post_id) REFERENCES circle_posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS circle_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  parent_comment_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES circle_posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS circle_reports (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES circle_posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS system_notifications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL,
  priority TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS square_banner_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_square_filters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  region TEXT,
  age_range TEXT,
  gender TEXT,
  membership_level TEXT,
  verified_only INTEGER DEFAULT 0,
  online_only INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS admin_permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_circle_posts_user ON circle_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id);
`;

const db = new SqliteStore();

module.exports = db;
