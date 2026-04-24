const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const uploadDirectory = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });

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

router.post('/single', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: '没有接收到上传文件。' });
    return;
  }

  res.json({
    file: formatFile(req, req.file),
  });
});

router.post('/multiple', authenticateToken, upload.array('files', 9), (req, res) => {
  const files = Array.isArray(req.files) ? req.files.map((file) => formatFile(req, file)) : [];
  res.json({ files });
});

router.post('/avatar', authenticateToken, upload.single('avatar'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: '没有接收到头像文件。' });
    return;
  }

  res.json({
    avatar: formatFile(req, req.file),
  });
});

router.post('/video', authenticateToken, upload.single('video'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: '没有接收到视频文件。' });
    return;
  }

  res.json({
    video: formatFile(req, req.file),
  });
});

router.post('/audio', authenticateToken, upload.single('audio'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: '没有接收到语音文件。' });
    return;
  }

  res.json({
    audio: formatFile(req, req.file),
  });
});

router.delete('/:filename', authenticateToken, (req, res) => {
  const target = path.join(uploadDirectory, req.params.filename);
  if (!fs.existsSync(target)) {
    res.status(404).json({ error: '未找到该文件。' });
    return;
  }
  fs.unlinkSync(target);
  res.json({ success: true });
});

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
