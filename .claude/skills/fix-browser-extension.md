# 修复浏览器扩展模块 Bug

> 专门用于诊断和修复浏览器扩展相关的 bug

---

## 使用场景

当遇到以下问题时使用此 skill：
- 扩展安装后无响应
- 右键菜单不显示
- WebSocket 连接问题
- Service Worker 休眠
- 跨浏览器兼容性问题
- 权限申请失败

---

## 相关文件

| 类型 | 文件路径 | 说明 |
|------|----------|------|
| 清单文件 | [browser-extension/manifest.json](../../../browser-extension/manifest.json) | 扩展配置（兼容 Chrome/Firefox） |
| 后台脚本 | [browser-extension/background.js](../../../browser-extension/background.js) | Service Worker 入口 |
| 公共基类 | [browser-extension/background-core.js](../../../browser-extension/background-core.js) | 后台脚本公共基类 |
| 内容脚本 | [browser-extension/content.js](../../../browser-extension/content.js) | 页面注入脚本 |
| 弹窗脚本 | [browser-extension/popup.js](../../../browser-extension/popup.js) | 弹窗逻辑 |
| WebSocket 管理器 | [browser-extension/websocket-manager.js](../../../browser-extension/websocket-manager.js) | WebSocket 连接管理 |

---

## 常见 Bug 与修复

### 1. 右键菜单不显示

**症状：**
- 右键点击页面没有扩展菜单

**修复步骤：**
1. 检查 manifest.json 中的 permissions
2. 检查 contextMenus 是否正确注册
3. 检查菜单创建时机

**相关代码：**
```javascript
// manifest.json
{
  "permissions": [
    "contextMenus",  // 必需
    "activeTab"
  ]
}

// background-core.js
createContextMenus() {
  chrome.contextMenus.create({
    id: 'save-bookmark',
    title: '保存到同步服务',
    contexts: ['page', 'link']  // 确保上下文正确
  });
}

// 在 onInstalled 时创建
chrome.runtime.onInstalled.addListener(() => {
  this.createContextMenus();
});
```

---

### 2. Service Worker 休眠导致功能失效

**症状：**
- 扩展一段时间后无响应
- WebSocket 断开
- 定时任务不执行

**修复方案：**
```javascript
// 使用 chrome.alarms 保持活跃
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // 执行保活操作
    this.checkWebSocketConnection();
  }
});

// 监听启动事件
chrome.runtime.onStartup.addListener(() => {
  this.restoreConnection();
});

// 保存状态到 storage
async saveState() {
  await chrome.storage.local.set({
    lastActive: Date.now(),
    wsConnected: this.wsConnected
  });
}
```

---

### 3. 消息通信失败

**症状：**
- popup 与 background 通信失败
- content script 与 background 通信失败

**修复代码：**
```javascript
// 发送消息 (popup.js -> background.js)
chrome.runtime.sendMessage({
  type: 'GET_SETTINGS'
}, (response) => {
  if (chrome.runtime.lastError) {
    console.error('消息发送失败:', chrome.runtime.lastError);
    return;
  }
  console.log('收到响应:', response);
});

// 接收消息 (background-core.js)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'GET_SETTINGS':
      sendResponse({ settings: this.settings });
      return true;  // 异步响应必须返回 true
  }
});
```

---

### 4. 跨浏览器兼容性问题

**症状：**
- Chrome 正常但 Firefox 异常
- API 调用失败

**修复方案：**
使用 browser-polyfill 统一 API：

```javascript
// manifest.json 已统一支持 Chrome/Edge/Firefox (MV3)
// 所有浏览器使用相同的代码

// 使用标准的 chrome API
chrome.runtime.sendMessage({ type: 'ACTION' });
chrome.storage.local.get('key');
chrome.bookmarks.create({ title: 'New', url: 'http://...' });
```

**注意：** Firefox 109+ 支持 Manifest V3，与 Chrome 使用相同的代码结构。

---

### 5. Token 存储获取失败

**症状：**
- API 请求返回 401
- Token 未正确保存

**修复代码：**
```javascript
// 保存 Token
async saveToken(token) {
  await chrome.storage.sync.set({ token });
  this.token = token;
}

// 获取 Token
async getToken() {
  const { token } = await chrome.storage.sync.get('token');
  if (!token) {
    throw new Error('未登录，请先登录 Web 客户端');
  }
  return token;
}

// 监听 Token 变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.token) {
    this.token = changes.token.newValue;
    this.reconnectWebSocket();
  }
});
```

---

### 6. WebSocket 连接失败

**症状：**
- 无法连接 WebSocket 服务器
- 连接后频繁断开

**修复代码：**
```javascript
// websocket-manager.js
async connect() {
  if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
    return;
  }

  try {
    this.isConnecting = true;
    
    const settings = await this.getStorageData(['token', 'serverUrl']);
    if (!settings.token) {
      console.log('❌ WebSocket连接失败: 未登录');
      this.isConnecting = false;
      return;
    }

    const serverUrl = settings.serverUrl || 'http://localhost:3001';
    const wsUrl = serverUrl.replace('http', 'ws') + `/ws?token=${settings.token}`;
    
    this.ws = new WebSocket(wsUrl);
    this.setupEventHandlers();
    
  } catch (error) {
    console.error('❌ WebSocket连接失败:', error);
    this.isConnecting = false;
    this.scheduleReconnect();
  }
}
```

---

## 调试技巧

### 1. 查看 Service Worker 日志

```
1. 打开 chrome://extensions/
2. 找到扩展，点击"背景页"或"Service Worker"
3. 查看 Console 日志
```

### 2. 检查存储数据

```javascript
// 在 Service Worker Console 中执行
chrome.storage.sync.get(null, (data) => {
  console.log('所有存储数据:', data);
});
```

### 3. 测试消息通信

```javascript
// 测试 popup 到 background 通信
chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
  console.log('响应:', response);
});
```

---

## 文件变更记录

> **2025-02-23**: 简化扩展结构
> - 删除 chrome/、firefox/、shared/ 子目录
> - 合并重复的 background.js 文件
> - 统一使用 ES Module 格式
> - 升级 Firefox 到 Manifest V3
> - 删除切换脚本（不再需要）
