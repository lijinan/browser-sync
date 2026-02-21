# 扩展 WebSocket 管理

> Level 3 文档 - WebSocket 连接管理详细说明

---

## 模块信息

| 属性 | 值 |
|------|-----|
| **文件** | [browser-extension/websocket-manager.js](../../browser-extension/websocket-manager.js) |
| **Service Worker 版本** | [websocket-manager-sw-module.js](../../browser-extension/websocket-manager-sw-module.js) |
| **用途** | 实时同步连接管理 |

---

## 功能说明

管理扩展与后端服务之间的 WebSocket 连接，实现实时数据同步。

### 核心功能

- WebSocket 连接管理
- 自动重连机制
- 心跳检测
- 消息分发
- 连接状态通知

---

## 类结构

### WebSocketManager (普通版本)

```javascript
class WebSocketManager {
  constructor() {
    this.ws = null;
    this.url = null;
    this.token = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.listeners = new Map();
    this.isConnecting = false;
  }

  // 方法
  connect(url, token)
  disconnect()
  send(type, data)
  onMessage(type, callback)
  onConnectionChange(callback)
  startHeartbeat()
  handleReconnect()
}
```

### WebSocketManagerSW (Service Worker 版本)

```javascript
// websocket-manager-sw-module.js
export class WebSocketManagerSW {
  constructor() {
    this.ws = null;
    this.url = null;
    this.token = null;
    // ... 同上
  }
}
```

---

## 连接流程

```
connect(url, token)
        │
        ▼
┌─────────────────┐
│  创建 WebSocket  │
│  连接实例        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  监听 onopen    │
│  发送认证消息    │
└────────┬────────┘
         │
         ├── 成功 ──► 启动心跳
         │           触发 connected 回调
         │
         └── 失败 ──► 触发重连
```

---

## 连接实现

```javascript
async connect(serverUrl, token) {
  if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
    return;
  }

  this.url = serverUrl;
  this.token = token;
  this.isConnecting = true;

  return new Promise((resolve, reject) => {
    try {
      // 构建 WebSocket URL
      const wsUrl = `${serverUrl.replace('http', 'ws')}/ws?token=${token}`;
      
      this.ws = new WebSocket(wsUrl);

      // 连接成功
      this.ws.onopen = () => {
        console.log('WebSocket 连接成功');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.notifyConnectionChange('connected');
        resolve();
      };

      // 接收消息
      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      // 连接关闭
      this.ws.onclose = (event) => {
        console.log('WebSocket 连接关闭:', event.code, event.reason);
        this.isConnecting = false;
        this.notifyConnectionChange('disconnected');
        this.handleReconnect();
      };

      // 连接错误
      this.ws.onerror = (error) => {
        console.error('WebSocket 错误:', error);
        this.isConnecting = false;
        reject(error);
      };

    } catch (error) {
      this.isConnecting = false;
      reject(error);
    }
  });
}
```

---

## 消息处理

### 发送消息

```javascript
send(type, data) {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
    console.warn('WebSocket 未连接');
    return false;
  }

  const message = JSON.stringify({ type, data });
  this.ws.send(message);
  return true;
}
```

### 接收消息

```javascript
handleMessage(rawData) {
  try {
    const message = JSON.parse(rawData);
    const { type, data } = message;

    // 处理心跳
    if (type === 'ping') {
      this.ws.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    // 分发给注册的监听器
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.forEach(callback => callback(message));
    }

    // 通用消息监听
    const allListeners = this.listeners.get('*');
    if (allListeners) {
      allListeners.forEach(callback => callback(message));
    }

  } catch (error) {
    console.error('消息解析失败:', error);
  }
}
```

---

## 事件监听

### 注册消息监听

```javascript
onMessage(type, callback) {
  if (!this.listeners.has(type)) {
    this.listeners.set(type, new Set());
  }
  this.listeners.get(type).add(callback);

  // 返回取消监听函数
  return () => {
    this.listeners.get(type).delete(callback);
  };
}
```

### 注册连接状态监听

```javascript
onConnectionChange(callback) {
  return this.onMessage('_connection_change', callback);
}

notifyConnectionChange(status) {
  const listeners = this.listeners.get('_connection_change');
  if (listeners) {
    listeners.forEach(callback => callback(status));
  }
}
```

---

## 心跳检测

```javascript
startHeartbeat() {
  // 清除旧的定时器
  if (this.heartbeatTimer) {
    clearInterval(this.heartbeatTimer);
  }

  // 30秒发送一次心跳
  this.heartbeatTimer = setInterval(() => {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // 检查上次心跳响应
      if (this.waitingForPong) {
        console.warn('心跳超时，断开连接');
        this.ws.close();
        return;
      }

      this.waitingForPong = true;
      this.ws.send(JSON.stringify({ type: 'ping' }));

      // 5秒内等待 pong 响应
      setTimeout(() => {
        if (this.waitingForPong) {
          console.warn('心跳响应超时');
          this.ws.close();
        }
      }, 5000);
    }
  }, 30000);
}
```

---

## 自动重连

```javascript
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

## 断开连接

```javascript
disconnect() {
  if (this.heartbeatTimer) {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  if (this.ws) {
    this.ws.close(1000, '用户主动断开');
    this.ws = null;
  }

  this.reconnectAttempts = 0;
  this.notifyConnectionChange('disconnected');
}
```

---

## 使用示例

### 在后台脚本中使用

```javascript
// background.js
import { WebSocketManagerSW } from './websocket-manager-sw-module.js';

class ExtensionBackground {
  constructor() {
    this.wsManager = new WebSocketManagerSW();
    this.initWebSocket();
  }

  async initWebSocket() {
    // 获取 Token
    const { token } = await chrome.storage.sync.get('token');
    const { serverUrl } = await chrome.storage.sync.get('serverUrl');

    if (!token) {
      console.warn('未登录，跳过 WebSocket 连接');
      return;
    }

    // 注册连接状态监听
    this.wsManager.onConnectionChange((status) => {
      console.log('连接状态:', status);
      this.updateBadge(status);
    });

    // 注册消息监听
    this.wsManager.onMessage('bookmark_change', (message) => {
      this.handleBookmarkChange(message.data);
    });

    this.wsManager.onMessage('password_change', (message) => {
      this.handlePasswordChange(message.data);
    });

    // 连接服务器
    try {
      await this.wsManager.connect(serverUrl, token);
    } catch (error) {
      console.error('WebSocket 连接失败:', error);
    }
  }

  updateBadge(status) {
    const colors = {
      connected: '#52c41a',
      disconnected: '#faad14',
      failed: '#f5222d'
    };

    chrome.action.setBadgeBackgroundColor({ 
      color: colors[status] || '#999' 
    });
    chrome.action.setBadgeText({ text: status === 'connected' ? '●' : '○' });
  }
}
```

### 消息格式

```javascript
// 书签变更消息
{
  "type": "bookmark_change",
  "data": {
    "action": "create" | "update" | "delete",
    "bookmark": {
      "id": 123,
      "title": "Example",
      "url": "https://example.com"
    }
  }
}

// 密码变更消息
{
  "type": "password_change",
  "data": {
    "action": "create" | "update" | "delete",
    "password": {
      "id": 456,
      "site_name": "Example Site"
    }
  }
}
```

---

## Service Worker 特殊处理

### 保持连接活跃

```javascript
// Service Worker 会在空闲时休眠
// 需要在 storage 中保存连接状态

async saveConnectionState(state) {
  await chrome.storage.local.set({
    wsState: state,
    lastActive: Date.now()
  });
}

// 恢复连接
async restoreConnection() {
  const { wsState, lastActive } = await chrome.storage.local.get(['wsState', 'lastActive']);
  
  if (wsState === 'connected') {
    // 检查是否超时
    if (Date.now() - lastActive > 60000) {
      // 超过1分钟，重新连接
      await this.connect(this.url, this.token);
    }
  }
}
```

### 处理休眠唤醒

```javascript
// 监听 Service Worker 唤醒
chrome.runtime.onStartup.addListener(() => {
  this.restoreConnection();
});

// 定期唤醒保持连接
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    this.checkConnection();
  }
});
```
