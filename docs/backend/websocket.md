# WebSocket 服务

> Level 3 文档 - 实时同步服务详细说明

---

## 模块信息

| 属性 | 值 |
|------|-----|
| **文件** | [backend/src/services/websocket.js](../../backend/src/services/websocket.js) |
| **依赖** | ws, jwt, knex |
| **路径** | `/ws` |

---

## 功能说明

提供 WebSocket 实时同步服务，支持多设备间的数据实时同步。

### 核心功能

- 用户连接管理
- JWT 身份验证
- 心跳检测
- 消息广播
- 连接状态统计

---

## 类结构

```javascript
class WebSocketService {
  constructor() {
    this.wss = null;                    // WebSocket Server 实例
    this.clients = new Map();           // 客户端连接映射 userId -> Set<WebSocket>
    this.heartbeatInterval = 30000;     // 心跳间隔 (30秒)
  }

  // 方法列表
  initialize(server)                    // 初始化服务
  handleConnection(ws, req)             // 处理新连接
  handleMessage(ws, data)               // 处理消息
  broadcastToUser(userId, type, data)   // 广播给特定用户
  startHeartbeat()                      // 启动心跳检测
  getStats()                            // 获取连接统计
}
```

---

## 连接流程

```
客户端发起连接
ws://localhost:3001/ws?token=<jwt_token>
        │
        ▼
┌───────────────────┐
│  提取 URL 参数    │
│  获取 token       │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  JWT 验证         │
│  解析用户信息     │
└───────────────────┘
        │
        ├── 失败 ──► 关闭连接 (1008)
        │
        ▼ 成功
┌───────────────────┐
│  存储连接         │
│  clients.set()    │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  发送欢迎消息     │
│  开始心跳检测     │
└───────────────────┘
```

---

## 连接验证实现

```javascript
async handleConnection(ws, req) {
  try {
    // 1. 从 URL 提取 token
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    
    if (!token) {
      ws.close(1008, '缺少认证token');
      return;
    }

    // 2. 验证 JWT
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      ws.close(1008, 'token无效');
      return;
    }

    // 3. 提取用户信息
    const userId = decoded.id || decoded.userId;
    
    // 4. 存储连接
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId).add(ws);

    // 5. 绑定用户信息到 WebSocket
    ws.userId = userId;
    ws.userInfo = { id: userId, name: decoded.name, email: decoded.email };

    // 6. 发送欢迎消息
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'WebSocket连接成功'
    }));

  } catch (error) {
    ws.close(1008, '连接失败');
  }
}
```

---

## 消息格式

### 客户端 -> 服务端

```javascript
// 心跳响应
{
  "type": "pong"
}

// 业务消息
{
  "type": "bookmark_change",
  "data": { ... }
}
```

### 服务端 -> 客户端

```javascript
// 连接成功
{
  "type": "connected",
  "message": "WebSocket连接成功"
}

// 心跳请求
{
  "type": "ping"
}

// 数据变更通知
{
  "type": "bookmark_change",
  "data": {
    "action": "create" | "update" | "delete",
    "bookmark": { ... }
  }
}

// 密码变更通知
{
  "type": "password_change",
  "data": {
    "action": "create" | "update" | "delete",
    "password": { ... }
  }
}
```

---

## 心跳检测

```javascript
startHeartbeat() {
  setInterval(() => {
    this.wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        // 终止无响应的连接
        this.clients.get(ws.userId)?.delete(ws);
        return ws.terminate();
      }
      
      ws.isAlive = false;
      ws.send(JSON.stringify({ type: 'ping' }));
    });
  }, this.heartbeatInterval);
}

// 客户端需要响应 pong
handleMessage(ws, data) {
  const message = JSON.parse(data);
  
  if (message.type === 'pong') {
    ws.isAlive = true;
    return;
  }
  
  // 处理其他消息类型...
}
```

---

## 广播方法

```javascript
// 广播给特定用户的所有设备
broadcastToUser(userId, type, data) {
  const userClients = this.clients.get(userId);
  if (!userClients) return;

  const message = JSON.stringify({ type, data });
  
  userClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

// 广播给所有连接
broadcastAll(type, data) {
  const message = JSON.stringify({ type, data });
  
  this.wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}
```

---

## 使用示例

### 在路由中触发广播

```javascript
// routes/bookmarks.js
const webSocketService = require('../services/websocket');

// 创建书签后通知
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const bookmark = await createBookmark(req.body);
    
    // 广播给用户所有设备
    webSocketService.broadcastToUser(req.user.id, 'bookmark_change', {
      action: 'create',
      bookmark: bookmark
    });
    
    res.status(201).json({ bookmark });
  } catch (error) {
    next(error);
  }
});
```

### 客户端连接示例

```javascript
// 浏览器扩展或 Web 客户端
const token = localStorage.getItem('token');
const ws = new WebSocket(`ws://localhost:3001/ws?token=${token}`);

ws.onopen = () => {
  console.log('WebSocket 连接成功');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'connected':
      console.log(message.message);
      break;
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    case 'bookmark_change':
      handleBookmarkChange(message.data);
      break;
  }
};

ws.onclose = (event) => {
  console.log('WebSocket 断开:', event.code, event.reason);
};
```

---

## 连接状态统计

```javascript
getStats() {
  let totalConnections = 0;
  const userConnections = {};

  this.clients.forEach((sockets, userId) => {
    const count = sockets.size;
    totalConnections += count;
    userConnections[userId] = count;
  });

  return {
    totalConnections,
    uniqueUsers: this.clients.size,
    userConnections
  };
}
```

### HTTP 状态检查端点

```javascript
// GET /ws/status
{
  "status": "ok",
  "websocket": {
    "totalConnections": 5,
    "uniqueUsers": 3,
    "userConnections": {
      "1": 2,
      "2": 1,
      "3": 2
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## 关闭状态码

| 状态码 | 说明 |
|--------|------|
| 1000 | 正常关闭 |
| 1008 | 策略违规 (认证失败) |
| 1011 | 服务器错误 |

---

## 错误处理

```javascript
ws.on('error', (error) => {
  console.error(`WebSocket 错误 (用户: ${ws.userId}):`, error);
  this.clients.get(ws.userId)?.delete(ws);
});

ws.on('close', (code, reason) => {
  console.log(`用户 ${ws.userId} 断开连接: ${code} - ${reason}`);
  this.clients.get(ws.userId)?.delete(ws);
});
```
