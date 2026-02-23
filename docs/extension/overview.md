# 浏览器扩展概览

> Level 2 文档 - 浏览器扩展模块整体说明

---

## 模块信息

| 属性 | 值 |
|------|-----|
| **路径** | `browser-extension/` |
| **技术栈** | Manifest V3 / WebExtension API |
| **支持浏览器** | Chrome, Edge, Firefox (109+) |
| **清单文件** | [manifest.json](../../browser-extension/manifest.json) |

---

## 目录结构

```
browser-extension/
├── manifest.json              # 扩展清单（兼容 Chrome/Edge/Firefox）
├── background.js              # 后台脚本入口（Service Worker）
├── background-core.js         # 后台脚本公共基类
├── content.js                 # 内容脚本
├── content-script.js          # 密码管理内容脚本
├── popup.html                 # 弹窗页面
├── popup.js                   # 弹窗逻辑
├── options.html               # 设置页面
├── options.js                 # 设置逻辑
├── websocket-manager.js       # WebSocket 管理器
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
| 后台基类 | [background-core.js](../../browser-extension/background-core.js) | 后台逻辑公共基类 |
| 内容脚本 | [content.js](../../browser-extension/content.js) | 注入页面的脚本 |
| 弹窗脚本 | [popup.js](../../browser-extension/popup.js) | 扩展弹窗逻辑 |
| 设置脚本 | [options.js](../../browser-extension/options.js) | 扩展设置页面 |

### 公共模块

| 模块 | 文件 | 说明 |
|------|------|------|
| WebSocket 管理 | [websocket-manager.js](../../browser-extension/websocket-manager.js) | WebSocket 连接管理 |
| 浏览器兼容 | [browser-polyfill.js](../../browser-extension/browser-polyfill.js) | 跨浏览器 API 兼容 |

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
    "bookmarks",      // 书签 API
    "commands",       // 快捷键
    "webNavigation"   // 页面导航
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

---

## 跨浏览器支持

### 支持的浏览器

| 浏览器 | 最低版本 | 说明 |
|--------|----------|------|
| Chrome | 88+ | 完全支持 |
| Edge | 88+ | 完全支持 |
| Firefox | 109+ | Manifest V3 支持 |

### 统一代码

所有浏览器使用相同的代码：

```javascript
// background.js - 所有浏览器通用
import { ExtensionBackgroundBase } from './background-core.js';
import { WebSocketManagerSW } from './websocket-manager.js';

class ExtensionBackground extends ExtensionBackgroundBase {
  constructor() {
    super(chrome);  // 使用 chrome API
    this.init();
  }
}
```

---

## 安装方法

### Chrome/Edge

1. 打开 `chrome://extensions/` 或 `edge://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `browser-extension` 文件夹

### Firefox

1. 打开 Firefox (版本 109+)
2. 访问 `about:debugging`
3. 点击"此 Firefox"
4. 点击"临时载入附加组件"
5. 选择 `browser-extension/manifest.json`

---

## 相关文档

- [后台脚本](./background.md) - Service Worker 详细说明
- [内容脚本](./content.md) - 内容脚本说明
- [WebSocket](./websocket.md) - WebSocket 通信说明
