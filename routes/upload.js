/**
 * 文件上传路由模块 (/api/v1/upload)
 *
 * 提供多种类型的文件上传接口（基于 multer）：
 * - POST   /single    → 上传单个文件
 * - POST   /multiple  → 批量上传（最多 9 个文件）
 * - POST   /avatar    → 上传头像
 * - POST   /video     → 上传视频
 * - POST   /audio     → 上传语音
 * - DELETE /:filename → 删除已上传的文件
 *
 * 配置：
 * - 上传目录：项目根目录/uploads/
 * - 文件命名：UUID + 原始扩展名
 * - 文件大小限制：25MB
 *
 * 所有接口均需登录认证
 * 上传成功后返回文件的访问 URL
 */

const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/* 初始化上传目录 */
const uploadDirectory = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });

/* 配置 multer 存储策略：文件名使用 UUID 避免冲突 */
const storage = multer.diskStorage({
  destination(_req, _file, callback) {
    callback(null, uploadDirectory);
  },
  filename(_req, file, callback) {
    callback(null, `${uuidv4()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

/** 上传单个文件 */
router.post('/single', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: '没有接收到上传文件。' });
    return;
  }

  res.json({
    file: formatFile(req, req.file),
  });
});

/** 批量上传文件（最多 9 个） */
router.post('/multiple', authenticateToken, upload.array('files', 9), (req, res) => {
  const files = Array.isArray(req.files) ? req.files.map((file) => formatFile(req, file)) : [];
  res.json({ files });
});

/** 上传头像 */
router.post('/avatar', authenticateToken, upload.single('avatar'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: '没有接收到头像文件。' });
    return;
  }

  res.json({
    avatar: formatFile(req, req.file),
  });
});

/** 上传视频 */
router.post('/video', authenticateToken, upload.single('video'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: '没有接收到视频文件。' });
    return;
  }

  res.json({
    video: formatFile(req, req.file),
  });
});

/** 上传语音 */
router.post('/audio', authenticateToken, upload.single('audio'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: '没有接收到语音文件。' });
    return;
  }

  res.json({
    audio: formatFile(req, req.file),
  });
});

/** 删除已上传的文件 */
router.delete('/:filename', authenticateToken, (req, res) => {
  const target = path.join(uploadDirectory, req.params.filename);
  if (!fs.existsSync(target)) {
    res.status(404).json({ error: '未找到该文件。' });
    return;
  }
  fs.unlinkSync(target);
  res.json({ success: true });
});

/** 格式化文件信息，生成完整的访问 URL */
function formatFile(req, file) {
  return {
    filename: file.filename,
    originalName: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    url: `${req.protocol}://${req.get('host')}/uploads/${file.filename}`,
  };
}

module.exports = router;
