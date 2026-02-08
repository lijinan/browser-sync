const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // 存储客户端连接 userId -> Set<WebSocket>
    this.heartbeatInterval = 30000; // 30秒心跳
  }

  initialize(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws'
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    
    // 启动心跳检测
    this.startHeartbeat();
    
    console.log('WebSocket服务已启动');
  }

  // 处理新连接
  async handleConnection(ws, req) {
    try {
      // 从URL中提取token并验证用户身份
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      
      if (!token) {
        console.log('WebSocket连接被拒绝: 缺少token');
        ws.close(1008, '缺少认证token');
        return;
      }

      // 验证JWT token
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (error) {
        console.log('WebSocket连接被拒绝: token无效', error.message);
        ws.close(1008, 'token无效');
        return;
      }

      // console.log('JWT解码结果:', { id: decoded.id, userId: decoded.userId, name: decoded.name, email: decoded.email });
      
      // 支持新旧JWT格式，提取用户信息
      const userId = decoded.id || decoded.userId;
      
      if (!userId) {
        console.log('WebSocket连接被拒绝: JWT中缺少用户ID');
        ws.close(1008, '用户ID缺失');
        return;
      }
      
      let userInfo;
      
      // 如果JWT中已包含用户信息，直接使用
      if (decoded.name && decoded.email) {
        userInfo = { 
          id: userId, 
          name: decoded.name, 
          email: decoded.email 
        };
        // console.log('使用JWT中的用户信息:', userInfo);
      } else {
        // 否则从数据库获取用户信息（向后兼容）
        try {
          const user = await db('users').where({ id: userId }).first();
          if (!user) {
            console.log('WebSocket连接被拒绝: 用户不存在');
            ws.close(1008, '用户不存在');
            return;
          }
          
          userInfo = { 
            id: user.id, 
            name: user.name, 
            email: user.email 
          };
          // console.log('从数据库获取用户信息:', userInfo);
        } catch (dbError) {
          console.log('WebSocket连接被拒绝: 数据库查询失败', dbError.message);
          ws.close(1008, '数据库查询失败');
          return;
        }
      }
      
      const userName = userInfo.name || `用户${userId}`;
      const userEmail = userInfo.email || '未知邮箱';
      
      console.log(`用户 ${userName} (ID: ${userId}, 邮箱: ${userEmail}) 建立WebSocket连接`);

      // 存储客户端连接
      if (!this.clients.has(userId)) {
        this.clients.set(userId, new Set());
      }
      this.clients.get(userId).add(ws);

      // 设置连接属性
      ws.userId = userId;
      ws.userName = userName;
      ws.userEmail = userEmail;
      ws.isAlive = true;
      ws.lastHeartbeat = Date.now();

      // 发送连接成功消息
      this.sendToClient(ws, {
        type: 'connection',
        status: 'connected',
        message: '实时同步已连接',
        user: { id: userId, name: userName, email: userEmail },
        timestamp: new Date().toISOString()
      });

      // 监听消息
      ws.on('message', (data) => {
        this.handleMessage(ws, data);
      });

      // 监听心跳响应
      ws.on('pong', () => {
        ws.isAlive = true;
        ws.lastHeartbeat = Date.now();
      });

      // 处理连接关闭
      ws.on('close', () => {
        console.log(`用户 ${userName} (ID: ${userId}) 断开WebSocket连接`);
        this.removeClient(userId, ws);
      });

      // 处理连接错误
      ws.on('error', (error) => {
        console.error(`WebSocket错误 (用户: ${userName}, ID: ${userId}):`, error);
        this.removeClient(userId, ws);
      });
      
    } catch (error) {
      console.error('WebSocket连接处理失败:', error);
      ws.close(1011, '服务器内部错误');
    }
  }

  // 处理客户端消息
  handleMessage(ws, data) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'ping':
          // 响应心跳
          this.sendToClient(ws, {
            type: 'pong',
            timestamp: new Date().toISOString()
          });
          break;
          
        case 'subscribe':
          // 订阅特定数据类型的更新
          ws.subscriptions = message.subscriptions || ['bookmarks', 'passwords'];
          this.sendToClient(ws, {
            type: 'subscribed',
            subscriptions: ws.subscriptions,
            message: '订阅成功'
          });
          
          // 发送初始数据
          this.sendInitialData(ws);
          break;
          
        default:
          console.log(`未知消息类型: ${message.type}`);
      }
    } catch (error) {
      console.error('处理WebSocket消息失败:', error);
    }
  }

  // 移除客户端连接
  removeClient(userId, ws) {
    if (this.clients.has(userId)) {
      this.clients.get(userId).delete(ws);
      if (this.clients.get(userId).size === 0) {
        this.clients.delete(userId);
      }
    }
  }

  // 发送消息给特定客户端
  sendToClient(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // 发送消息给特定用户的所有连接
  sendToUser(userId, message) {
    if (this.clients.has(userId)) {
      const userConnections = this.clients.get(userId);
      userConnections.forEach(ws => {
        this.sendToClient(ws, message);
      });
    }
  }

  // 发送初始数据给客户端
  async sendInitialData(ws) {
    try {
      const userId = ws.userId;
      if (!userId) return;

      const data = {};

      // 获取用户的书签数据
      if (!ws.subscriptions || ws.subscriptions.includes('bookmarks')) {
        const bookmarks = await db('bookmarks')
          .where({ user_id: userId })
          .select('id', 'encrypted_data', 'created_at', 'updated_at');

        // 解密书签数据，跳过解密失败的书签
        const decryptedBookmarks = [];
        const CryptoJS = require('crypto-js');

        for (const bookmark of bookmarks) {
          try {
            const bytes = CryptoJS.AES.decrypt(bookmark.encrypted_data, process.env.ENCRYPTION_KEY);
            const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
            const decrypted = JSON.parse(decryptedString);

            decryptedBookmarks.push({
              id: bookmark.id,
              ...decrypted,
              created_at: bookmark.created_at,
              updated_at: bookmark.updated_at
            });
          } catch (decryptError) {
            console.error(`书签 ID ${bookmark.id} 解密失败 (WebSocket初始数据):`, decryptError.message);
          }
        }

        data.bookmarks = decryptedBookmarks;
      }

      // 获取用户的密码数据
      if (!ws.subscriptions || ws.subscriptions.includes('passwords')) {
        const passwords = await db('passwords')
          .where({ user_id: userId })
          .select('id', 'encrypted_data', 'created_at', 'updated_at');

        // 解密密码数据，跳过解密失败的密码
        const decryptedPasswords = [];
        const CryptoJS = require('crypto-js');

        for (const password of passwords) {
          try {
            const bytes = CryptoJS.AES.decrypt(password.encrypted_data, process.env.ENCRYPTION_KEY);
            const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
            const decrypted = JSON.parse(decryptedString);

            decryptedPasswords.push({
              id: password.id,
              ...decrypted,
              created_at: password.created_at,
              updated_at: password.updated_at
            });
          } catch (decryptError) {
            console.error(`密码 ID ${password.id} 解密失败 (WebSocket初始数据):`, decryptError.message);
          }
        }

        data.passwords = decryptedPasswords;
      }

      // 发送初始化数据
      this.sendToClient(ws, {
        type: 'init',
        data: data,
        timestamp: new Date().toISOString()
      });

      console.log(`📦 发送初始数据给用户 ${ws.userName} (ID: ${userId}): ${data.bookmarks?.length || 0} 个书签, ${data.passwords?.length || 0} 个密码`);
    } catch (error) {
      console.error('发送初始数据失败:', error);
    }
  }

  // 广播消息给所有连接的用户
  broadcast(message, excludeUserId = null) {
    this.clients.forEach((connections, userId) => {
      if (userId !== excludeUserId) {
        connections.forEach(ws => {
          this.sendToClient(ws, message);
        });
      }
    });
  }

  // 通知书签变更
  notifyBookmarkChange(userId, action, bookmark, excludeUserId = null) {
    const message = {
      type: 'bookmark_change',
      action: action, // 'created', 'updated', 'deleted'
      data: bookmark,
      timestamp: new Date().toISOString(),
      userId: userId
    };

    console.log(`📡 广播书签变更通知: ${action} - ${bookmark.title}`);
    console.log(`📊 当前连接用户数: ${this.clients.size}`);

    // 发送给所有连接的用户（包括同一用户的不同浏览器连接）
    this.clients.forEach((connections, clientUserId) => {
      // 跳过被排除的用户
      if (clientUserId === excludeUserId) {
        return;
      }
      
      connections.forEach(ws => {
        if (!ws.subscriptions || ws.subscriptions.includes('bookmarks')) {
          const userName = ws.userName || `用户${clientUserId}`;
          console.log(`📤 发送通知给用户 ${userName} (ID: ${clientUserId})`);
          this.sendToClient(ws, message);
        }
      });
    });
  }

  // 通知密码变更
  notifyPasswordChange(userId, action, password, excludeUserId = null) {
    const message = {
      type: 'password_change',
      action: action, // 'created', 'updated', 'deleted'
      data: password,
      timestamp: new Date().toISOString(),
      userId: userId
    };

    console.log(`🔐 广播密码变更通知: ${action} - ${password.site_name}`);
    console.log(`📊 当前连接用户数: ${this.clients.size}`);

    // 发送给所有连接的用户（包括同一用户的不同浏览器连接）
    this.clients.forEach((connections, clientUserId) => {
      // 跳过被排除的用户
      if (clientUserId === excludeUserId) {
        return;
      }
      
      connections.forEach(ws => {
        if (!ws.subscriptions || ws.subscriptions.includes('passwords')) {
          const userName = ws.userName || `用户${clientUserId}`;
          console.log(`📤 发送密码通知给用户 ${userName} (ID: ${clientUserId})`);
          this.sendToClient(ws, message);
        }
      });
    });
  }

  // 启动心跳检测
  startHeartbeat() {
    setInterval(() => {
      this.clients.forEach((connections, userId) => {
        connections.forEach(ws => {
          if (!ws.isAlive) {
            const userName = ws.userName || `用户${userId}`;
            console.log(`移除无响应的连接: 用户 ${userName} (ID: ${userId})`);
            ws.terminate();
            this.removeClient(userId, ws);
            return;
          }
          
          ws.isAlive = false;
          ws.ping();
        });
      });
    }, this.heartbeatInterval);
  }

  // 获取连接统计
  getStats() {
    let totalConnections = 0;
    this.clients.forEach(connections => {
      totalConnections += connections.size;
    });

    return {
      connectedUsers: this.clients.size,
      totalConnections: totalConnections,
      clients: Array.from(this.clients.keys()).map(userId => ({
        userId,
        connections: this.clients.get(userId).size
      }))
    };
  }
}

// 创建单例实例
const webSocketService = new WebSocketService();

module.exports = webSocketService;