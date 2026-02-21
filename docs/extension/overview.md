# 浏览器扩展概览

> Level 2 文档 - 浏览器扩展模块整体说明

---

## 模块信息

| 属性 | 值 |
|------|-----|
| **路径** | `browser-extension/` |
| **技术栈** | Manifest V3 / WebExtension API |
| **支持浏览器** | Chrome, Edge, Firefox |
| **清单文件** | [manifest.json](../../browser-extension/manifest.json) |

---

## 目录结构

```
browser-extension/
├── manifest.json              # 扩展清单 (Chrome)
├── manifest-chrome.json       # Chrome 清单
├── manifest-firefox.json      # Firefox 清单
├── background.js              # 后台脚本 (Service Worker)
├── background-firefox.js      # Firefox 后台脚本
├── background-common.js       # 公共后台逻辑基类
├── background-common-module.js # ES Module 公共模块
├── content.js                 # 内容脚本
├── content-script.js          # 内容脚本 (备用)
├── popup.html                 # 弹窗页面
├── popup.js                   # 弹窗逻辑
├── options.html               # 设置页面
├── options.js                 # 设置逻辑
├── websocket-manager.js       # WebSocket 管理器
├── websocket-manager-sw.js    # Service Worker WebSocket
├── websocket-manager-sw-module.js # WebSocket ES Module
├── browser-polyfill.js        # 跨浏览器兼容
└── icons/                     # 图标资源
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 核心模块

### 脚本模块

| 模块 | 文件 | 说明 |
|------|------|------|
| 后台脚本 | [background.js](../../browser-extension/background.js) | Service Worker 主入口 |
| 内容脚本 | [content.js](../../browser-extension/content.js) | 注入页面的脚本 |
| 弹窗脚本 | [popup.js](../../browser-extension/popup.js) | 扩展弹窗逻辑 |
| 设置脚本 | [options.js](../../browser-extension/options.js) | 扩展设置页面 |

### 公共模块

| 模块 | 文件 | 说明 |
|------|------|------|
| 后台基类 | [background-common.js](../../browser-extension/background-common.js) | 跨浏览器兼容基类 |
| WebSocket 管理 | [websocket-manager.js](../../browser-extension/websocket-manager.js) | WebSocket 连接管理 |

---

## Manifest V3 配置

### 基本信息

```json
{
  "manifest_version": 3,
  "name": "书签密码同步助手",
  "version": "2.0.0",
  "description": "可配置的书签密码管理扩展，支持多种工作模式"
}
```

### 权限配置

```json
{
  "permissions": [
    "activeTab",      // 当前标签页访问
    "storage",        // 数据存储
    "tabs",           // 标签页管理
    "contextMenus",   // 右键菜单
    "scripting",      // 脚本注入
    "bookmarks",      // 书签 API
    "commands",       // 快捷键
    "webNavigation",  // 页面导航
    "notifications"   // 通知
  ],
  "host_permissions": [
    "http://localhost:3001/*",
    "http://localhost:3002/*",
    "https://*/*",
    "http://*/*"
  ]
}
```

### 后台脚本配置

```json
{
  "background": {
    "service_worker": "background.js",
    "type": "module"
  }
}
```

### 内容脚本配置

```json
{
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_end"
    }
  ]
}
```

### 快捷键配置

```json
{
  "commands": {
    "save-bookmark": {
      "suggested_key": {
        "default": "Ctrl+Shift+D"
      },
      "description": "保存书签到同步服务"
    },
    "open-settings": {
      "suggested_key": {
        "default": "Ctrl+Shift+S"
      },
      "description": "打开扩展设置"
    }
  }
}
```

---

## 功能模块

### 1. 右键菜单保存

```javascript
// 创建右键菜单
chrome.contextMenus.create({
  id: 'save-bookmark',
  title: '保存到同步服务',
  contexts: ['page', 'link']
});

// 监听菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'save-bookmark') {
    saveBookmarkToServer(tab);
  }
});
```

### 2. 书签自动同步

```javascript
// 监听浏览器书签创建
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  if (settings.autoSync) {
    syncBookmarkToServer(bookmark);
  }
});

// 监听浏览器书签删除
chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  if (settings.autoSync) {
    deleteBookmarkFromServer(id);
  }
});
```

### 3. 表单自动填充

```javascript
// 内容脚本检测登录表单
document.addEventListener('DOMContentLoaded', () => {
  const forms = document.querySelectorAll('form');
  forms.forEach(form => {
    if (isLoginForm(form)) {
      injectAutoFillButton(form);
    }
  });
});
```

### 4. 实时同步

```javascript
// WebSocket 连接管理
wsManager.onMessage('bookmark_change', (message) => {
  // 更新本地书签
  updateLocalBookmark(message.data);
});

wsManager.onMessage('password_change', (message) => {
  // 更新本地密码缓存
  updateLocalPassword(message.data);
});
```

---

## 扩展架构

```
┌─────────────────────────────────────────────────────────┐
│                   Browser Extension                      │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Popup     │  │   Options   │  │   Content   │     │
│  │   (UI)      │  │   (UI)      │  │   Script    │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │             │
│         └────────────────┼────────────────┘             │
│                          │                              │
│                          ▼                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │              Background (Service Worker)          │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  │  │
│  │  │  Context   │  │  Bookmark  │  │ WebSocket  │  │  │
│  │  │  Menus     │  │  Sync      │  │ Manager    │  │  │
│  │  └────────────┘  └────────────┘  └────────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────┘
                             │
                             │ REST API / WebSocket
                             ▼
                    ┌─────────────────┐
                    │   Backend API   │
                    └─────────────────┘
```

---

## 消息通信

### 扩展内部消息

```javascript
// content.js -> background.js
chrome.runtime.sendMessage({
  type: 'SAVE_BOOKMARK',
  data: { url, title }
});

// background.js 接收
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SAVE_BOOKMARK') {
    handleSaveBookmark(request.data);
    sendResponse({ success: true });
  }
});
```

### 与后端通信

```javascript
// REST API 调用
const saveBookmark = async (bookmark) => {
  const response = await fetch('http://localhost:3001/api/bookmarks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(bookmark)
  });
  return response.json();
};
```

---

## 存储管理

### Chrome Storage API

```javascript
// 保存设置
chrome.storage.sync.set({
  serverUrl: 'http://localhost:3001',
  autoSync: true,
  token: 'jwt_token'
});

// 读取设置
chrome.storage.sync.get(['serverUrl', 'autoSync', 'token'], (result) => {
  console.log(result.serverUrl);
  console.log(result.autoSync);
});

// 监听存储变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.token) {
    // Token 变化，重新连接 WebSocket
    reconnectWebSocket();
  }
});
```

---

## 跨浏览器兼容

### 使用 browser-polyfill

```javascript
// 使用统一的 API
browser.runtime.sendMessage({ type: 'ACTION' });
browser.storage.local.get('key');
browser.bookmarks.create({ title: 'New', url: 'http://...' });

// 而不是
chrome.runtime.sendMessage({ type: 'ACTION' });
```

### Firefox 特殊处理

```javascript
// background-firefox.js
// Firefox 使用 background script 而非 service worker
import { ExtensionBackgroundBase } from './background-common-module.js';

class FirefoxBackground extends ExtensionBackgroundBase {
  constructor() {
    super(browser);  // 使用 browser API
    this.init();
  }
}

new FirefoxBackground();
```

---

## 开发与调试

### 加载扩展

1. 打开 `chrome://extensions/`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `browser-extension` 目录

### 查看日志

```javascript
// Service Worker 日志
// chrome://extensions/ -> 扩展详情 -> 查看 Service Worker

// 内容脚本日志
// 在网页开发者工具控制台查看
```

### 切换浏览器版本

```bash
# 切换到 Chrome 版本
./switch-to-chrome.sh

# 切换到 Firefox 版本
./switch-to-firefox.sh
```

---

## 详细文档

| 文档 | 路径 | 说明 |
|------|------|------|
| 后台脚本 | [background.md](background.md) | Service Worker 详细说明 |
| 内容脚本 | [content.md](content.md) | 内容脚本详细说明 |
| WebSocket | [websocket.md](websocket.md) | WebSocket 管理详细说明 |
