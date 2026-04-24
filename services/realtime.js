/**
 * 实时通信服务 - WebSocket 管理
 *
 * 职责：
 * - 在 HTTP 服务器上拦截 /ws/chat 的 upgrade 请求，建立 WebSocket 连接
 * - 通过 URL 参数中的 JWT token 鉴别用户身份
 * - 维护 userId → WebSocket 客户端集合的映射，支持同一用户多设备同时在线
 * - 提供 pushToUser 方法，向指定用户的所有活跃连接推送实时消息
 */

const { WebSocketServer } = require('ws');
const url = require('url');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || '37degrees-dev-secret';

class RealtimeService {
  constructor() {
    this.clientsByUserId = new Map();
  }

  attach(server) {
    const wss = new WebSocketServer({
      noServer: true,
    });

    server.on('upgrade', (request, socket, head) => {
      const parsed = url.parse(request.url, true);
      if (parsed.pathname !== '/ws/chat') {
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, parsed.query);
      });
    });

    wss.on('connection', (socket, request, query) => {
      try {
        const payload = jwt.verify(query.token || '', JWT_SECRET);
        const userId = payload.userId;
        const clients = this.clientsByUserId.get(userId) || new Set();
        clients.add(socket);
        this.clientsByUserId.set(userId, clients);

        socket.send(
          JSON.stringify({
            kind: 'connected',
          }),
        );

        socket.on('close', () => {
          const currentClients = this.clientsByUserId.get(userId);
          if (!currentClients) {
            return;
          }
          currentClients.delete(socket);
          if (currentClients.size === 0) {
            this.clientsByUserId.delete(userId);
          }
        });
      } catch (_) {
        socket.close();
      }
    });
  }

  pushToUser(userId, payload) {
    const clients = this.clientsByUserId.get(userId);
    if (!clients) {
      return;
    }
    const message = JSON.stringify(payload);
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }
}

module.exports = new RealtimeService();
