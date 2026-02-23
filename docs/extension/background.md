# 后台脚本

> Level 3 文档 - Service Worker 详细说明

---

## 模块信息

| 属性 | 值 |
|------|-----|
| **文件** | [browser-extension/background.js](../../browser-extension/background.js) |
| **类型** | Service Worker (Manifest V3) |
| **导入方式** | ES Module |

---

## 架构设计

```javascript
// background.js - Service Worker 入口
import { ExtensionBackgroundBase } from './background-core.js';
import { WebSocketManagerSW } from './websocket-manager.js';

class ExtensionBackground extends ExtensionBackgroundBase {
  constructor() {
    super(chrome);
    this.init();
    this.initWebSocketManager();
  }

  initWebSocketManager() {
    this.wsManager = new WebSocketManagerSW();
    // 绑定事件处理
  }
}

new ExtensionBackground();
```

---

## 初始化流程

```
扩展加载
    │
    ▼
┌─────────────────┐
│ 构造函数执行    │
│ super(chrome)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   init()        │
│ 注册事件监听    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 加载设置        │
│ loadSettings()  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 初始化 WebSocket│
│ 连接服务器      │
└─────────────────┘
```

---

## 事件监听器

### 1. 扩展安装/更新

```javascript
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // 首次安装
    setDefaultSettings();
    createContextMenus();
  } else if (details.reason === 'update') {
    // 扩展更新
    migrateSettings(details.previousVersion);
  }
});
```

### 2. 浏览器启动

```javascript
chrome.runtime.onStartup.addListener(() => {
  console.log('浏览器启动，初始化扩展');
  loadSettings();
  connectWebSocket();
});
```

### 3. 右键菜单

```javascript
// 创建菜单
createContextMenus() {
  chrome.contextMenus.create({
    id: 'save-bookmark',
    title: '保存到同步服务',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'save-link',
    title: '保存链接到同步服务',
    contexts: ['link']
  });
}

// 监听点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'save-bookmark':
      this.saveCurrentPage(tab);
      break;
    case 'save-link':
      this.saveLink(info.linkUrl, info.linkText);
      break;
  }
});
```

### 4. 书签事件

```javascript
// 书签创建
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  if (this.settings.autoSync) {
    this.syncBookmarkToServer(bookmark);
  }
});

// 书签删除
chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  if (this.settings.autoSync) {
    this.deleteBookmarkFromServer(id);
  }
});

// 书签更新
chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
  if (this.settings.autoSync) {
    this.updateBookmarkOnServer(id, changeInfo);
  }
});

// 书签移动
chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
  if (this.settings.autoSync) {
    this.moveBookmarkOnServer(id, moveInfo);
  }
});
```

### 5. 快捷键命令

```javascript
chrome.commands.onCommand.addListener((command) => {
  switch (command) {
    case 'save-bookmark':
      this.saveCurrentPage();
      break;
    case 'open-settings':
      chrome.runtime.openOptionsPage();
      break;
  }
});
```

### 6. 标签页更新

```javascript
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // 检查是否需要自动填充
    this.checkAutoFill(tabId, tab.url);
  }
});
```

### 7. 消息处理

```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'SAVE_BOOKMARK':
      this.saveBookmark(request.data)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;  // 异步响应

    case 'GET_SETTINGS':
      sendResponse({ settings: this.settings });
      break;

    case 'UPDATE_SETTINGS':
      this.updateSettings(request.settings);
      sendResponse({ success: true });
      break;

    case 'GET_PASSWORDS':
      this.getPasswordsForUrl(request.url)
        .then(passwords => sendResponse({ passwords }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
  }
});
```

---

## 核心功能实现

### 保存书签

```javascript
async saveBookmark(bookmarkData) {
  const token = await this.getToken();

  const response = await fetch(`${this.settings.serverUrl}/api/bookmarks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      title: bookmarkData.title,
      url: bookmarkData.url,
      folder: bookmarkData.folder || '',
      tags: bookmarkData.tags || [],
      description: bookmarkData.description || ''
    })
  });

  if (!response.ok) {
    throw new Error('保存书签失败');
  }

  const result = await response.json();
  this.showNotification('书签保存成功', 'success');
  return result;
}
```

### 保存当前页面

```javascript
async saveCurrentPage(tab) {
  const bookmarkData = {
    title: tab.title,
    url: tab.url,
    folder: '',
    tags: [],
    description: ''
  };

  await this.saveBookmark(bookmarkData);
}
```

### 获取密码列表

```javascript
async getPasswordsForUrl(url) {
  const token = await this.getToken();

  const response = await fetch(`${this.settings.serverUrl}/api/passwords`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const data = await response.json();

  // 过滤匹配当前 URL 的密码
  return data.passwords.filter(p =>
    url.includes(new URL(p.site_url).hostname)
  );
}
```

### 显示通知

```javascript
showNotification(title, type = 'info') {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: title,
    message: type === 'success' ? '操作成功' : '请注意',
    priority: 1
  });
}
```

---

## 设置管理

### 默认设置

```javascript
setDefaultSettings() {
  chrome.storage.sync.set({
    serverUrl: 'http://localhost:3001',
    autoSync: false,
    showNotifications: true,
    contextMenu: true
  });
}
```

### 加载设置

```javascript
async loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (items) => {
      this.settings = items;
      resolve(items);
    });
  });
}
```

### 更新设置

```javascript
async updateSettings(newSettings) {
  await chrome.storage.sync.set(newSettings);
  this.settings = { ...this.settings, ...newSettings };

  // 重新初始化相关功能
  if (newSettings.contextMenu !== undefined) {
    this.updateContextMenus();
  }
}
```

---

## WebSocket 集成

```javascript
initWebSocketManager() {
  this.wsManager = new WebSocketManagerSW();

  // 连接状态变化
  this.wsManager.onConnectionChange((status) => {
    console.log('WebSocket 状态:', status);
    if (status === 'connected') {
      this.showNotification('实时同步已连接', 'success');
    }
  });

  // 接收书签变更
  this.wsManager.onMessage('bookmark_change', (message) => {
    this.handleRemoteBookmarkChange(message.data);
  });

  // 接收密码变更
  this.wsManager.onMessage('password_change', (message) => {
    this.handleRemotePasswordChange(message.data);
  });
}
```

---

## 公共基类 (background-core.js)

### 类定义

```javascript
class ExtensionBackgroundBase {
  constructor(extensionAPI) {
    this.extensionAPI = extensionAPI;
    this.settings = {};
    this.wsManager = null;
  }

  init() {
    // 注册所有事件监听器
    this.setupEventListeners();
    this.loadSettings();
  }

  setupEventListeners() {
    // 扩展安装
    this.extensionAPI.runtime.onInstalled.addListener(() => {
      this.createContextMenus();
      this.setDefaultSettings();
    });

    // 消息处理
    this.extensionAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true;
    });

    // 书签事件
    if (this.extensionAPI.bookmarks) {
      this.extensionAPI.bookmarks.onCreated.addListener((id, bookmark) => {
        this.onBookmarkCreated(id, bookmark);
      });
    }
  }

  // 子类可覆盖的方法
  onBookmarkCreated(id, bookmark) {}
  onBookmarkRemoved(id, removeInfo) {}
  onTabUpdated(tabId, tab) {}
}
```

---

## 生命周期

```
┌─────────────────┐
│  扩展安装/更新   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Service Worker  │
│    启动         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  事件监听激活   │
│  (空闲时休眠)   │
└────────┬────────┘
         │
         │ 30秒无活动
         ▼
┌─────────────────┐
│ Service Worker  │
│    休眠         │
└─────────────────┘
```

### 注意事项

- Service Worker 在空闲时会休眠
- 需要持久化重要状态到 storage
- WebSocket 连接需要处理重连
- 避免使用全局变量存储状态

---

## 文件变更记录

> **2025-02-23**: 简化扩展结构
> - 删除 chrome/、firefox/、shared/ 子目录
> - 合并重复的 background.js 文件
> - 统一使用 ES Module 格式
> - 升级 Firefox 到 Manifest V3
