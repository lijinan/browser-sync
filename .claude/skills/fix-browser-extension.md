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
| 清单文件 | [browser-extension/manifest.json](../../../browser-extension/manifest.json) | Chrome 扩展配置 |
| Firefox 清单 | [browser-extension/manifest-firefox.json](../../../browser-extension/manifest-firefox.json) | Firefox 配置 |
| 后台脚本 | [browser-extension/background.js](../../../browser-extension/background.js) | Chrome Service Worker |
| Firefox 后台 | [browser-extension/background-firefox.js](../../../browser-extension/background-firefox.js) | Firefox 后台脚本 |
| 公共基类 | [browser-extension/background-common-module.js](../../../browser-extension/background-common-module.js) | 跨浏览器基类 |
| 内容脚本 | [browser-extension/content.js](../../../browser-extension/content.js) | 页面注入脚本 |
| 弹窗脚本 | [browser-extension/popup.js](../../../browser-extension/popup.js) | 弹窗逻辑 |
| WebSocket 管理器 | [browser-extension/websocket-manager-sw-module.js](../../../browser-extension/websocket-manager-sw-module.js) | SW 版本 |

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

// background.js
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

// 接收消息 (background.js)
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
// 使用统一的 API
browser.runtime.sendMessage({ type: 'ACTION' });
browser.storage.local.get('key');
browser.bookmarks.create({ title: 'New', url: 'http://...' });

// 而不是
chrome.runtime.sendMessage({ type: 'ACTION' });
```

**Firefox 特殊处理：**
```javascript
// background-firefox.js
import { ExtensionBackgroundBase } from './background-common-module.js';

class FirefoxBackground extends ExtensionBackgroundBase {
  constructor() {
    super(browser);  // 使用 browser API
    this.init();
  }
}
```

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

### 6. 书签自动同步不工作

**症状：**
- 浏览器书签变化后未同步到服务器

**修复代码：**
```javascript
// background.js
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  if (this.settings.autoSync) {
    this.syncBookmarkToServer(bookmark);
  }
});

// 检查设置
async loadSettings() {
  const settings = await chrome.storage.sync.get({
    autoSync: false,
    serverUrl: 'http://localhost:3001'
  });
  this.settings = settings;
}

// 同步书签
async syncBookmarkToServer(bookmark) {
  const token = await this.getToken();

  const response = await fetch(`${this.settings.serverUrl}/api/bookmarks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      title: bookmark.title,
      url: bookmark.url,
      folder: ''
    })
  });

  if (response.ok) {
    this.showNotification('书签已同步', 'success');
  }
}
```

---

### 7. 快捷键不工作

**症状：**
- 按下快捷键无反应

**修复步骤：**
1. 检查 manifest.json 中的 commands 配置
2. 检查命令监听器是否注册

**相关代码：**
```javascript
// manifest.json
{
  "commands": {
    "save-bookmark": {
      "suggested_key": {
        "default": "Ctrl+Shift+D",
        "mac": "Command+Shift+D"
      },
      "description": "保存书签到同步服务"
    }
  }
}

// background.js
chrome.commands.onCommand.addListener((command) => {
  if (command === 'save-bookmark') {
    this.saveCurrentPage();
  }
});
```

---

### 8. 内容脚本注入失败

**症状：**
- 页面中没有注入脚本
- 自动填充不工作

**修复代码：**
```javascript
// manifest.json
{
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_end"
    }
  ]
}

// content.js
// 检查是否被正确加载
console.log('Bookmark Sync content script loaded');

// 检测登录表单
document.addEventListener('DOMContentLoaded', () => {
  const forms = document.querySelectorAll('form');
  forms.forEach(form => {
    if (isLoginForm(form)) {
      injectAutoFillButton(form);
    }
  });
});
```

---

### 9. 通知权限问题

**症状：**
- 通知无法显示
- 控制台提示权限错误

**修复步骤：**
1. 检查 manifest.json 中的 permissions
2. 检查通知 API 调用

**相关代码：**
```javascript
// manifest.json
{
  "permissions": [
    "notifications"  // 必需
  ]
}

// background.js
showNotification(title, message = '') {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: title,
    message: message,
    priority: 1
  });
}
```

---

## 调试技巧

### 查看日志

```
Chrome:
1. 打开 chrome://extensions/
2. 找到扩展，点击"查看 Service Worker"

Firefox:
1. 打开 about:debugging#/runtime/this-firefox
2. 找到扩展，点击"检查"

Content Script:
在网页开发者工具控制台查看
```

### 重新加载扩展

```
Chrome: chrome://extensions/ -> 点击刷新按钮
Firefox: about:debugging -> 临时附加插件
```

---

## 清单文件检查清单

```json
{
  "manifest_version": 3,
  "permissions": [
    "activeTab",
    "storage",
    "tabs",
    "contextMenus",
    "scripting",
    "bookmarks",
    "commands",
    "webNavigation",
    "notifications"
  ],
  "host_permissions": [
    "http://localhost:3001/*",
    "https://*/*",
    "http://*/*"
  ]
}
```

---

## 切换浏览器版本

```bash
# 切换到 Chrome 版本
./switch-to-chrome.sh

# 切换到 Firefox 版本
./switch-to-firefox.sh
```
