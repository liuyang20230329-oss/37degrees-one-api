/**
 * 37° Local API - 主入口文件
 *
 * 职责：
 * 1. 加载环境变量（dotenv）
 * 2. 初始化 Express 应用及中间件
 * 3. 注册所有业务路由模块
 * 4. 提供 /health（含数据库检测）和 /api/v1/status 端点
 * 5. 启动 HTTP 服务并挂载 WebSocket 实时通信服务
 * 6. 支持 SIGTERM/SIGINT 优雅关闭
 */

require('dotenv').config();

const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const db = require('./config/database');
const realtime = require('./services/realtime');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const chatRoutes = require('./routes/chat');
const circleRoutes = require('./routes/circle');
const squareRoutes = require('./routes/square');
const notificationRoutes = require('./routes/notifications');
const reviewRoutes = require('./routes/reviews');
const adminRoutes = require('./routes/admin');
const searchRoutes = require('./routes/search');
const uploadRoutes = require('./routes/upload');

const app = express();
const port = resolvePort(process.env.API_PORT);
const apiBase = process.env.API_BASE || '/api/v1';

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(morgan('dev'));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/** 健康检查端点（含数据库连接状态检测） */
app.get('/health', async (_req, res) => {
  try {
    await db.get('SELECT 1');
    res.json({
      status: 'ok',
      service: '37degrees-local-api',
      mode: 'sqlite',
      database: 'connected',
    });
  } catch (_) {
    res.status(503).json({
      status: 'degraded',
      service: '37degrees-local-api',
      mode: 'sqlite',
      database: 'disconnected',
    });
  }
});

app.get(`${apiBase}/status`, async (_req, res) => {
  await db.ready;
  res.json({
    status: 'running',
    api: '37degrees-local-api',
    version: '1.2.0',
    endpoints: {
      auth: `${apiBase}/auth`,
      users: `${apiBase}/users`,
      chat: `${apiBase}/chat`,
      circle: `${apiBase}/circle`,
      square: `${apiBase}/square`,
      notifications: `${apiBase}/notifications`,
      reviews: `${apiBase}/reviews`,
      admin: `${apiBase}/admin`,
      search: `${apiBase}/search`,
      upload: `${apiBase}/upload`,
      websocket: '/ws/chat',
    },
  });
});

app.use(`${apiBase}/auth`, authRoutes);
app.use(`${apiBase}/users`, userRoutes);
app.use(`${apiBase}/chat`, chatRoutes);
app.use(`${apiBase}/circle`, circleRoutes);
app.use(`${apiBase}/square`, squareRoutes);
app.use(`${apiBase}/notifications`, notificationRoutes);
app.use(`${apiBase}/reviews`, reviewRoutes);
app.use(`${apiBase}/admin`, adminRoutes);
app.use(`${apiBase}/search`, searchRoutes);
app.use(`${apiBase}/upload`, uploadRoutes);

app.use((_req, res) => {
  res.status(404).json({
    error: 'Route not found.',
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    error: error.message || 'Internal server error.',
  });
});

let httpServer = null;

async function start() {
  await db.ready;
  httpServer = app.listen(port, () => {
    console.log('='.repeat(60));
    console.log('37° Local API is ready');
    console.log(`HTTP  : http://127.0.0.1:${port}`);
    console.log(`Status: http://127.0.0.1:${port}${apiBase}/status`);
    console.log(`WS    : ws://127.0.0.1:${port}/ws/chat`);
    console.log('='.repeat(60));
  });
  realtime.attach(httpServer);
}

/** 优雅关闭：停止接收新请求 → 关闭 WebSocket → 关闭 HTTP → 关闭数据库 */
function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);
  if (!httpServer) {
    process.exit(0);
  }
  realtime.close();
  httpServer.close(() => {
    db.close().then(() => {
      console.log('Database connection closed.');
      process.exit(0);
    }).catch((error) => {
      console.error('Error closing database:', error);
      process.exit(1);
    });
  });
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

function resolvePort(value) {
  if (!value || value.trim().length === 0) {
    return 3001;
  }
  if (value.trim() === '3000') {
    return 3001;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 3001;
  }
  return parsed;
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = app;
