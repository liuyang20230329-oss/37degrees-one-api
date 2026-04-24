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

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: '37degrees-local-api',
    mode: 'sqlite',
  });
});

app.get(`${apiBase}/status`, async (_req, res) => {
  await db.ready;
  res.json({
    status: 'running',
    api: '37degrees-local-api',
    version: '1.1.0',
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

async function start() {
  await db.ready;
  const server = app.listen(port, () => {
    console.log('='.repeat(60));
    console.log('37° Local API is ready');
    console.log(`HTTP  : http://127.0.0.1:${port}`);
    console.log(`Status: http://127.0.0.1:${port}${apiBase}/status`);
    console.log(`WS    : ws://127.0.0.1:${port}/ws/chat`);
    console.log('='.repeat(60));
  });
  realtime.attach(server);
}

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
