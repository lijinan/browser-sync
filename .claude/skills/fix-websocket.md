# 修复 WebSocket 实时同步模块 Bug

> 专门用于诊断和修复 WebSocket 实时同步相关的 bug

---

## 使用场景

当遇到以下问题时使用此 skill：
- WebSocket 连接失败
- 实时同步不工作
- 消息发送/接收失败
- 心跳检测异常
- 连接频繁断开重连

---

## 相关文件

| 类型 | 文件路径 | 说明 |
|------|----------|------|
| 后端服务 | [backend/src/services/websocket.js](../../../backend/src/services/websocket.js) | WebSocket 服务 |
| 扩展管理器 | [browser-extension/websocket-manager.js](../../../browser-extension/websocket-manager.js) | 扩展 WebSocket 管理器 |
| SW 管理器 | [browser-extension/websocket-manager-sw-module.js](../../../browser-extension/websocket-manager-sw-module.js) | Service Worker 版本 |
| 后台脚本 | [browser-extension/background.js](../../../browser-extension/background.js) | 后台 WebSocket 集成 |

---

## 常见 Bug 与修复

### 1. WebSocket 连接失败 (1008 错误码)

**症状：**
```
WebSocket 连接关闭: 1008 - 缺少认证token/token无效
```

**连接 URL 格式：**
```
ws://localhost:3001/ws?token=<jwt_token>
```

**修复步骤：**
1. 检查 Token 是否存在且有效
2. 检查 URL 格式是否正确
3. 确认 JWT_SECRET 配置一致

**相关代码：**
```javascript
// backend/src/services/websocket.js
async handleConnection(ws, req) {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(1008, '缺少认证token');
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded.userId;
    // ... 存储连接
  } catch (error) {
    ws.close(1008, 'token无效');
  }
}
```

---

### 2. 心跳检测超时断开

**症状：**
- 连接建立后 30 秒左右自动断开
- 控制台显示 `心跳超时`

**工作原理：**
```
服务端每 30 秒发送 ping
客户端需在 5 秒内响应 pong
超时未响应则断开连接
```

**修复步骤：**
1. 检查客户端是否正确响应 ping
2. 检查心跳定时器是否正常运行

**客户端代码：**
```javascript
// 浏览器扩展/前端客户端
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'ping') {
    // 必须响应 pong
    ws.send(JSON.stringify({ type: 'pong' }));
    return;
  }

  // 处理其他消息...
};
```

---

### 3. 消息广播未到达客户端

**症状：**
- 后端调用广播方法但客户端未收到
- 部分设备收到，部分设备未收到

**修复步骤：**
1. 检查 WebSocket 连接状态
2. 确认用户 ID 正确
3. 检查客户端消息监听器注册

**服务端广播代码：**
```javascript
// backend/src/services/websocket.js
broadcastToUser(userId, type, data) {
  const userClients = this.clients.get(userId);
  if (!userClients) {
    console.log(`用户 ${userId} 没有活跃连接`);
    return;
  }

  const message = JSON.stringify({ type, data });
  let sentCount = 0;

  userClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sentCount++;
    }
  });

  console.log(`广播给用户 ${userId}: ${sentCount} 个连接`);
}
```

---

### 4. Service Worker 休眠导致断连

**症状：**
- 扩展在后台时 WebSocket 断开
- Service Worker 休眠后连接丢失

**修复步骤：**
1. 监听 Service Worker 唤醒事件
2. 使用 chrome.alarms 保持连接
3. 保存连接状态到 storage

**相关代码：**
```javascript
// browser-extension/background.js
// 监听启动事件
chrome.runtime.onStartup.addListener(() => {
  this.wsManager.restoreConnection();
});

// 定期保持连接
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    this.wsManager.checkConnection();
  }
});
```

---

### 5. 重连机制失效

**症状：**
- 连接断开后不再重连
- 重连次数达到上限后停止

**修复代码：**
```javascript
// browser-extension/websocket-manager.js
handleReconnect() {
  if (this.reconnectAttempts >= this.maxReconnectAttempts) {
    console.error('重连次数已达上限');
    this.notifyConnectionChange('failed');
    return;
  }

  this.reconnectAttempts++;
  const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

  console.log(`${delay}ms 后尝试第 ${this.reconnectAttempts} 次重连`);

  setTimeout(() => {
    this.connect(this.url, this.token).catch(error => {
      console.error('重连失败:', error);
    });
  }, delay);
}
```

---

### 6. 消息格式错误

**症状：**
```
错误: 消息解析失败
Unexpected token...
```

**修复步骤：**
1. 确保消息是有效 JSON
2. 检查消息结构是否正确

**消息格式规范：**
```javascript
// 服务端 -> 客户端
{
  "type": "bookmark_change" | "password_change" | "ping" | "connected",
  "data": {
    "action": "create" | "update" | "delete",
    "bookmark" | "password": { ... }
  }
}

// 客户端 -> 服务端
{
  "type": "pong"
}
```

---

### 7. 连接状态统计不准确

**症状：**
- `/ws/status` 返回的连接数不正确
- 断开的连接未被清理

**修复代码：**
```javascript
// backend/src/services/websocket.js
ws.on('close', (code, reason) => {
  console.log(`用户 ${ws.userId} 断开连接: ${code} - ${reason}`);

  // 清理连接
  if (ws.userId) {
    const userClients = this.clients.get(ws.userId);
    if (userClients) {
      userClients.delete(ws);

      // 如果用户没有其他连接，删除用户条目
      if (userClients.size === 0) {
        this.clients.delete(ws.userId);
      }
    }
  }
});

ws.on('error', (error) => {
  console.error(`WebSocket 错误 (用户: ${ws.userId}):`, error);
  // 同样清理连接
});
```

---

## 调试技巧

### 服务端调试

```javascript
// backend/src/services/websocket.js
// 添加调试日志
getStats() {
  let totalConnections = 0;
  const userConnections = {};

  this.clients.forEach((sockets, userId) => {
    const count = sockets.size;
    totalConnections += count;
    userConnections[userId] = count;
  });

  console.log('WebSocket 统计:', {
    totalConnections,
    uniqueUsers: this.clients.size,
    userConnections
  });

  return { totalConnections, uniqueUsers, userConnections };
}
```

### 客户端调试

```javascript
// 浏览器控制台
// 查看当前 WebSocket 状态
console.log('WebSocket 状态:', ws.readyState);
// 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED

// 查看连接 URL
console.log('WebSocket URL:', ws.url);
```

---

## 连接测试

### 服务端状态检查

```bash
# 获取 WebSocket 连接统计
curl http://localhost:3001/ws/status

# 响应示例
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
  }
}
```

### 客户端连接测试

```javascript
// 浏览器控制台测试
const token = localStorage.getItem('token');
const ws = new WebSocket(`ws://localhost:3001/ws?token=${token}`);

ws.onopen = () => console.log('连接成功');
ws.onmessage = (e) => console.log('收到消息:', e.data);
ws.onclose = (e) => console.log('连接关闭:', e.code, e.reason);
ws.onerror = (e) => console.error('连接错误:', e);
```

---

## 环境变量检查

```bash
# backend/.env
JWT_SECRET=your-jwt-secret-key
# 确保 JWT_SECRET 与认证模块一致
```

---

## 常见关闭状态码

| 状态码 | 说明 | 处理方式 |
|--------|------|----------|
| 1000 | 正常关闭 | 无需处理 |
| 1008 | 策略违规（认证失败） | 检查 Token 有效性 |
| 1011 | 服务器错误 | 检查服务端日志 |
