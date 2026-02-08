# 书签密码同步应用 - 架构与流程文档

> 本文档详细描述了系统的架构设计、数据流程、用户操作流程以及关键代码位置，用于快速定位问题和功能开发。

---

## 📋 目录

1. [项目概述](#项目概述)
2. [系统架构](#系统架构)
3. [用户操作流程](#用户操作流程)
4. [数据流转与加密](#数据流转与加密)
5. [定时器与事件监听器](#定时器与事件监听器)
6. [关键文件索引](#关键文件索引)
7. [快速定位问题指南](#快速定位问题指南)

---

## 1. 项目概述

### 1.1 应用简介

这是一个**书签和密码同步应用**，支持私有化部署和端到端加密。用户可以通过 Web 客户端和浏览器扩展安全地在多个设备间同步书签和密码。

### 1.2 核心组件

| 组件 | 技术栈 | 端口 | 说明 |
|------|--------|------|------|
| **后端 API** | Node.js + Express + PostgreSQL | 3001 | REST API + WebSocket 实时同步 |
| **Web 客户端** | React 18 + Vite + Ant Design | 3002 | 用户管理界面 |
| **浏览器扩展** | Manifest V3 (Chrome/Edge/Firefox) | - | 右键保存、自动检测、实时同步 |
| **数据库** | PostgreSQL | 5432 | 持久化存储 |

### 1.3 数据流概览

```
┌─────────────┐
│  Browser    │
│  Extension  │
└──────┬──────┘
       │ WebSocket + REST API
       ▼
┌─────────────┐         ┌──────────────┐
│   Backend   │ ◄────►  │  PostgreSQL  │
│   (Express) │         │  Database    │
└─────────────┘         └──────────────┘
       ▲
       │ REST API
       │
┌──────┴──────┐
│  Web Client │
│  (React)    │
└─────────────┘
```

---

## 2. 系统架构

### 2.1 后端架构 ([backend/src/app.js](backend/src/app.js))

```
backend/
├── src/
│   ├── app.js                      # Express 应用入口
│   ├── routes/                     # API 路由
│   │   ├── auth.js                 # 认证路由 (登录/注册/验证)
│   │   ├── bookmarks.js            # 书签 CRUD
│   │   ├── passwords.js            # 密码 CRUD
│   │   └── import-export.js        # 导入导出功能
│   ├── middleware/                 # 中间件
│   │   ├── auth.js                 # JWT 验证
│   │   ├── errorHandler.js         # 错误处理
│   │   └── validator.js            # Joi 参数验证
│   ├── services/                   # 服务层
│   │   └── websocket.js            # WebSocket 实时同步
│   └── config/
│       └── database.js             # Knex.js 数据库配置
└── knexfile.js                     # 数据库迁移配置
```

#### 2.1.1 API 路由总览

| 路由前缀 | 方法 | 端点 | 说明 | 文件位置 |
|----------|------|------|------|----------|
| `/api/auth` | POST | `/register` | 用户注册 | [routes/auth.js](backend/src/routes/auth.js:21) |
| `/api/auth` | POST | `/login` | 用户登录 | [routes/auth.js](backend/src/routes/auth.js:42) |
| `/api/auth` | GET | `/me` | 获取当前用户信息 | [routes/auth.js](backend/src/routes/auth.js:75) |
| `/api/auth` | POST | `/verify-password` | 二次密码验证 | [routes/auth.js](backend/src/routes/auth.js:85) |
| `/api/bookmarks` | GET | `/` | 获取所有书签 | [routes/bookmarks.js](backend/src/routes/bookmarks.js:11) |
| `/api/bookmarks` | POST | `/` | 创建书签 | [routes/bookmarks.js](backend/src/routes/bookmarks.js:31) |
| `/api/bookmarks` | PUT | `/:id` | 更新书签 | [routes/bookmarks.js](backend/src/routes/bookmarks.js:74) |
| `/api/bookmarks` | DELETE | `/:id` | 删除书签 | [routes/bookmarks.js](backend/src/routes/bookmarks.js:105) |
| `/api/passwords` | GET | `/` | 获取密码列表 | [routes/passwords.js](backend/src/routes/passwords.js:12) |
| `/api/passwords` | GET | `/:id` | 获取密码详情 | [routes/passwords.js](backend/src/routes/passwords.js:42) |
| `/api/import-export` | GET | `/bookmarks/export` | 导出书签 JSON | [routes/import-export.js](backend/src/routes/import-export.js:12) |

### 2.2 前端架构 ([web-client/src/App.jsx](web-client/src/App.jsx))

```
web-client/
├── src/
│   ├── main.jsx                     # 应用入口
│   ├── App.jsx                      # 根组件（路由配置）
│   ├── pages/                       # 页面组件
│   │   ├── Dashboard.jsx            # 仪表盘
│   │   ├── Bookmarks.jsx            # 书签管理
│   │   ├── Passwords.jsx            # 密码管理
│   │   ├── Login.jsx                # 登录页
│   │   └── ImportExport.jsx         # 导入导出
│   ├── components/
│   │   └── Layout/
│   │       └── AppLayout.jsx        # 主布局（侧边栏、顶部栏）
│   ├── contexts/
│   │   ├── AuthContext.jsx          # 认证上下文
│   │   └── ThemeContext.jsx         # 主题上下文
│   └── services/
│       └── api.js                   # Axios 实例配置
└── vite.config.js                   # Vite 构建配置
```

#### 2.2.1 路由结构

| 路径 | 组件 | 访问控制 | 说明 |
|------|------|----------|------|
| `/login` | Login | 公开 | 登录页 |
| `/register` | Register | 公开 | 注册页 |
| `/` | Dashboard | 需登录 | 重定向到 Dashboard |
| `/dashboard` | Dashboard | 需登录 | 统计概览 |
| `/bookmarks` | Bookmarks | 需登录 | 书签管理 |
| `/passwords` | Passwords | 需登录 | 密码管理 |
| `/import-export` | ImportExport | 需登录 | 数据导入导出 |

### 2.3 浏览器扩展架构

```
browser-extension/
├── manifest.json                    # 扩展配置清单
├── background.js                    # Service Worker (后台脚本)
├── popup.js                         # 弹窗逻辑
├── popup.html                       # 弹窗界面
├── content.js                       # 内容脚本（注入页面）
├── websocket-manager.js             # WebSocket 客户端管理器
└── options.html                     # 设置页面
```

#### 2.3.1 扩展权限

```json
{
  "permissions": [
    "activeTab",      // 当前标签页访问
    "storage",        // chrome.storage API
    "tabs",           // 标签页管理
    "contextMenus",   // 右键菜单
    "scripting",      // 脚本注入
    "bookmarks",      // 书签 API
    "commands",       // 快捷键命令
    "webNavigation"   // 导航事件监听
  ]
}
```

---

## 3. 用户操作流程

### 3.1 用户注册/登录流程

```
┌─────────┐     ┌──────────┐     ┌─────────┐     ┌──────────┐
│  用户   │────▶│ Web/Ext  │────▶│ Backend │────▶│Database  │
└─────────┘     └──────────┘     └─────────┘     └──────────┘
                    │                  │
                    │                  ▼
                    │           ┌──────────────┐
                    │           │  生成 JWT    │
                    │           │  Token       │
                    │           └──────────────┘
                    │                  │
                    ▼                  ▼
              ┌────────────◀───────────┘
              │  存储 Token   │
              │  (localStorage│
              │   或 chrome.  │
              │   storage)    │
              └────────────────┘
```

**代码位置：**
- Web 登录：[web-client/src/pages/Login.jsx](web-client/src/pages/Login.jsx)
- 扩展登录：[browser-extension/popup.js](browser-extension/popup.js:117)
- 后端认证：[backend/src/routes/auth.js](backend/src/routes/auth.js:42)

### 3.2 保存书签流程

#### 方式一：Web 客户端保存

```
用户点击"添加书签"
    │
    ▼
打开 Modal 表单
    │
    ▼
用户填写标题/URL/文件夹
    │
    ▼
POST /api/bookmarks
    │
    ▼
后端加密数据并存储
    │
    ▼
WebSocket 广播变更
    │
    ▼
其他客户端实时同步
```

**代码位置：** [web-client/src/pages/Bookmarks.jsx](web-client/src/pages/Bookmarks.jsx)

#### 方式二：浏览器扩展保存

```
用户右键"保存为书签"
    │
    ▼
background.js 监听菜单事件
    │
    ▼
发送 SAVE_BOOKMARK 消息
    │
    ▼
检查登录状态
    │
    ▼
POST /api/bookmarks
    │
    ▼
显示成功通知
```

**代码位置：**
- 菜单点击：[background.js:571](browser-extension/background.js:571)
- 保存逻辑：[background.js:1252](browser-extension/background.js:1252)

#### 方式三：自动同步（从"同步收藏夹"）

```
用户在"同步收藏夹"添加书签
    │
    ▼
chrome.bookmarks.onCreated 触发
    │
    ▼
检查是否在"同步收藏夹"内
    │
    ▼
获取文件夹路径
    │
    ▼
自动上传到服务器
    │
    ▼
WebSocket 广播变更
```

**代码位置：** [background.js:624](browser-extension/background.js:624)

### 3.3 密码保存流程

#### 自动检测登录表单

```
用户访问登录页面
    │
    ▼
content.js 检测密码表单
    │
    ▼
显示"💾 点击保存密码"提示
    │
    ▼
用户点击保存按钮
    │
    ▼
发送 SAVE_PASSWORD 消息到 background
    │
    ▼
background POST /api/passwords
    │
    ▼
密码加密存储
```

**代码位置：**
- 表单检测：[content.js:205](browser-extension/content.js:205)
- 保存提示：[content.js:220](browser-extension/content.js:220)
- 后端存储：[background.js:1342](browser-extension/background.js:1342)

#### 表单提交监听

```
用户填写表单并提交
    │
    ▼
content.js 监听 submit 事件
    │
    ▼
延迟检查登录是否成功
    │
    ▼
显示"保存密码？"弹窗
    │
    ▼
用户点击保存
    │
    ▼
发送到服务器
```

**代码位置：** [content.js:298](browser-extension/content.js:298)

### 3.4 实时同步流程（WebSocket）

```
┌──────────────┐         ┌──────────────┐
│   Client 1   │         │   Client 2   │
└──────┬───────┘         └──────┬───────┘
       │                        ▲
       │                        │
       ▼                        │
┌──────────────┐               │
│   Backend    │               │
│  WebSocket   │───────────────┘
│   Server     │    broadcast
└──────────────┘

流程：
1. Client 1 修改书签
2. 发送 REST API 到 Backend
3. Backend 更新数据库
4. Backend WebSocket 广播变更
5. Client 2 收到消息，自动更新本地
```

**代码位置：**
- 后端 WebSocket：[backend/src/services/websocket.js](backend/src/services/websocket.js:96)
- 扩展客户端：[browser-extension/websocket-manager.js](browser-extension/websocket-manager.js:93)

### 3.5 导入导出流程

#### 导出书签

```
用户点击"导出书签"
    │
    ▼
GET /api/import-export/bookmarks/export
    │
    ▼
后端查询用户所有书签
    │
    ▼
解密数据并生成 JSON/HTML
    │
    ▼
前端下载文件
```

**代码位置：** [backend/src/routes/import-export.js:12](backend/src/routes/import-export.js:12)

#### 导入书签

```
用户选择文件上传
    │
    ▼
POST /api/import-export/bookmarks/import
    │
    ▼
Multer 解析文件
    │
    ▼
根据 MIME 类型解析 (JSON/HTML)
    │
    ▼
验证并加密数据
    │
    ▼
批量插入数据库
    │
    ▼
WebSocket 广播变更
```

**代码位置：** [backend/src/routes/import-export.js:60](backend/src/routes/import-export.js:60)

---

## 4. 数据流转与加密

### 4.1 加密机制

#### 4.1.1 加密算法

- **算法**: AES-256 (CryptoJS)
- **密钥**: `ENCRYPTION_KEY` (32字符) 存储在后端 `.env`
- **存储格式**: JSON 字符串加密后存储在 `encrypted_data` 字段

#### 4.1.2 书签加密结构

```json
{
  "title": "书签标题",
  "url": "https://example.com",
  "folder": "同步收藏夹 > 编程",
  "tags": ["技术", "学习"],
  "description": "描述信息",
  "position": 1
}
```

**代码位置：**
- 后端加密：[backend/src/routes/bookmarks.js:44](backend/src/routes/bookmarks.js:44)
- 后端解密：[backend/src/routes/bookmarks.js:18](backend/src/routes/bookmarks.js:18)

#### 4.1.3 密码加密结构

```json
{
  "site_name": "GitHub",
  "site_url": "https://github.com",
  "username": "user@example.com",
  "password": "明文密码（加密存储）",
  "notes": "备注信息",
  "category": "开发工具"
}
```

**代码位置：**
- 后端加密：[backend/src/routes/passwords.js:39](backend/src/routes/passwords.js:39)
- 后端解密：[backend/src/routes/passwords.js:19](backend/src/routes/passwords.js:19)

### 4.2 数据流转图

#### 4.2.1 创建书签数据流

```
┌─────────┐
│  用户   │ 在 Web/Ext 输入书签信息
└────┬────┘
     │
     ▼
┌─────────────┐
│ Frontend    │ 1. 收集表单数据
│ (React/Ext) │ 2. 发送 POST /api/bookmarks
└────┬────────┘
     │
     ▼ JSON {title, url, folder, tags}
┌─────────────┐
│ Backend     │ 1. 验证 JWT Token
│ Express     │ 2. Joi 验证参数
└────┬────────┘     │
     │              ▼
     │       ┌──────────────┐
     │       │ Middleware   │
     │       │  验证通过     │
     │       └──────┬───────┘
     │              │
     ▼              ▼
┌──────────────────────┐
│ Routes/bookmarks.js  │
│ POST /               │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Encryption Logic     │
│ AES-256 Encrypt      │
│ encrypted_data       │
└──────┬───────────────┘
       │
       ▼ INSERT INTO bookmarks
┌──────────────┐         (user_id, encrypted_data)
│ PostgreSQL   │
│   Database   │
└──────┬───────┘
       │
       ▼ Query Result
┌──────────────┐
│   WebSocket  │ notifyBookmarkChange()
│   Service    │ broadcast to all clients
└──────┬───────┘
       │
       ▼ ws.send({type: 'bookmark_change', action: 'created', data})
┌───────────────────────────────┐
│ Other Clients (Web/Extension) │
│ 实时更新本地书签列表          │
└───────────────────────────────┘
```

**关键代码位置：**
- JWT 验证：[backend/src/middleware/auth.js:9](backend/src/middleware/auth.js:9)
- Joi 验证：[backend/src/middleware/validator.js:12](backend/src/middleware/validator.js:12)
- 加密逻辑：[backend/src/routes/bookmarks.js:44](backend/src/routes/bookmarks.js:44)
- WebSocket 通知：[backend/src/services/websocket.js:139](backend/src/services/websocket.js:139)

#### 4.2.2 密码查看数据流（二次验证）

```
┌─────────┐
│  用户   │ 点击"查看密码"
└────┬────┘
     │
     ▼
┌─────────────┐
│ Frontend    │ 1. 显示密码验证弹窗
│ Passwords   │ 2. 要求输入主密码
└────┬────────┘
     │
     ▼ 用户输入主密码
┌─────────────┐
│ Frontend    │ POST /api/auth/verify-password
└────┬────────┘ {password}
     │
     ▼
┌──────────────┐
│ Backend      │ 1. 验证 JWT
│ auth.js      │ 2. bcrypt 比对密码
└────┬─────────┘
     │
     ▼ 验证成功
┌──────────────┐
│ Frontend    │ GET /api/passwords/:id
└────┬─────────┘
     │
     ▼
┌──────────────┐
│ Backend      │ 1. 验证权限
│ passwords.js │ 2. 解密 encrypted_data
└────┬─────────┘ 3. 返回包含明文密码的数据
     │
     ▼ {site_name, username, password: "明文", ...}
┌──────────────┐
│ Frontend    │ 显示密码（可复制）
└─────────────┘
```

**关键代码位置：**
- 密码验证：[backend/src/routes/auth.js:85](backend/src/routes/auth.js:85)
- 获取密码详情：[backend/src/routes/passwords.js:42](backend/src/routes/passwords.js:42)
- 前端验证弹窗：[web-client/src/pages/Passwords.jsx](web-client/src/pages/Passwords.jsx)

---

## 5. 定时器与事件监听器

### 5.1 定时器总览

#### 5.1.1 后端定时器

| 定时器 | 位置 | 间隔 | 功能 |
|--------|------|------|------|
| WebSocket 心跳检测 | [websocket.js:331](backend/src/services/websocket.js:331) | 30秒 | 检查客户端连接状态，清理死连接 |

```javascript
// backend/src/services/websocket.js:331
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000); // 30秒
```

#### 5.1.2 扩展定时器

| 定时器 | 位置 | 延迟/间隔 | 功能 |
|--------|------|----------|------|
| API 加载重试 | [popup.js:12](browser-extension/popup.js:12) | 100ms | 等待 extensionAPI 加载 |
| WebSocket 心跳 | [websocket-manager.js:485](browser-extension/websocket-manager.js:485) | 25秒 | 发送 ping 消息保持连接 |
| WebSocket 重连 | [websocket-manager.js:514](browser-extension/websocket-manager.js:514) | 指数退避 | 连接断开后自动重连 |
| 浏览器启动延迟 | [background.js:145](browser-extension/background.js:145) | 2秒 | 浏览器启动后延迟执行同步 |
| 全量同步延迟 | [background.js:149](browser-extension/background.js:149) | 3秒 | WebSocket 连接后延迟执行全量同步 |
| 表单检测延迟 | [content.js:23](browser-extension/content.js:23) | 1秒 | 页面加载后延迟检测表单 |
| 保存提示隐藏 | [content.js:291](browser-extension/content.js:291) | 5秒 | 保存按钮提示自动消失 |
| 通知自动隐藏 | [content.js:488](browser-extension/content.js:488) | 3秒 | 页面通知自动消失 |

**关键代码示例：**

```javascript
// WebSocket 心跳 - websocket-manager.js:485
startHeartbeat() {
  this.heartbeatInterval = setInterval(() => {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 25000); // 25秒发送一次心跳
}

// WebSocket 重连 - websocket-manager.js:503
scheduleReconnect() {
  if (this.reconnectAttempts >= this.maxReconnectAttempts) {
    console.log('❌ WebSocket重连次数已达上限，停止重连');
    return;
  }

  this.reconnectAttempts++;
  const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // 指数退避

  setTimeout(() => {
    this.connect();
  }, delay);
}
```

### 5.2 事件监听器总览

#### 5.2.1 后端事件监听器

| 事件 | 位置 | 触发条件 | 处理函数 |
|------|------|----------|----------|
| HTTP 请求 | [app.js:27](backend/src/app.js:27) | API 调用 | 路由处理 |
| WebSocket 连接 | [websocket.js:86](backend/src/services/websocket.js:86) | 客户端连接 | 验证 Token |
| WebSocket 消息 | [websocket.js:119](backend/src/services/websocket.js:119) | 接收消息 | 订阅/心跳 |
| 进程退出 | [test/server.js:84](test/server.js:84) | SIGINT 信号 | 关闭数据库连接 |

#### 5.2.2 扩展事件监听器

##### Background Script 事件监听器

| 事件 | 位置 | 触发条件 | 处理函数 | 功能 |
|------|------|----------|----------|------|
| `runtime.onStartup` | [background.js:18](browser-extension/background.js:18) | 浏览器启动 | [handleBrowserStartup](browser-extension/background.js:118) | 启动时自动同步 |
| `runtime.onInstalled` | [background.js:26](browser-extension/background.js:26) | 扩展安装/更新 | [createContextMenus](browser-extension/background.js:427) | 创建右键菜单 |
| `runtime.onMessage` | [background.js:33](browser-extension/background.js:33) | 接收消息 | [handleMessage](browser-extension/background.js:483) | 处理来自 popup/content 的消息 |
| `tabs.onUpdated` | [background.js:39](browser-extension/background.js:39) | 标签页更新 | [onTabUpdated](browser-extension/background.js:591) | 自动检测表单 |
| `bookmarks.onCreated` | [background.js:47](browser-extension/background.js:47) | 书签创建 | [onBookmarkCreated](browser-extension/background.js:624) | 自动同步到服务器 |
| `bookmarks.onRemoved` | [background.js:52](browser-extension/background.js:52) | 书签删除 | [onBookmarkRemoved](browser-extension/background.js:781) | 从服务器删除 |
| `bookmarks.onMoved` | [background.js:57](browser-extension/background.js:57) | 书签移动 | [onBookmarkMoved](browser-extension/background.js:901) | 更新服务器文件夹信息 |
| `bookmarks.onChanged` | [background.js:62](browser-extension/background.js:62) | 书签更新 | [onBookmarkChanged](browser-extension/background.js:962) | 更新服务器标题 |
| `commands.onCommand` | [background.js:68](browser-extension/background.js:68) | 快捷键 | [onCommand](browser-extension/background.js:1204) | 执行快捷键命令 |
| `storage.onChanged` | [background.js:73](browser-extension/background.js:73) | 设置变更 | [loadSettings](browser-extension/background.js:383) | 重新加载设置 |
| `contextMenus.onClicked` | [background.js:450](browser-extension/background.js:450) | 右键菜单点击 | [handleContextMenuClick](browser-extension/background.js:571) | 执行菜单命令 |

##### Content Script 事件监听器

| 事件 | 位置 | 触发条件 | 处理函数 | 功能 |
|------|------|----------|----------|------|
| `runtime.onMessage` | [content.js:15](browser-extension/content.js:15) | 接收消息 | [handleMessage](browser-extension/content.js:49) | 处理来自 background 的消息 |
| `DOMContentLoaded` | [content.js:22](browser-extension/content.js:22) | 页面加载完成 | [autoDetectForms](browser-extension/content.js:205) | 自动检测登录表单 |
| `submit` (表单) | [content.js:300](browser-extension/content.js:300) | 表单提交 | 匿名函数 | 检测登录成功后提示保存密码 |

##### WebSocket 事件监听器

| 事件 | 位置 | 触发条件 | 处理函数 | 功能 |
|------|------|----------|----------|------|
| `onopen` | [websocket-manager.js:49](browser-extension/websocket-manager.js:49) | 连接成功 | 订阅数据、启动心跳 | 初始化连接 |
| `onmessage` | [websocket-manager.js:64](browser-extension/websocket-manager.js:64) | 收到消息 | [handleMessage](browser-extension/websocket-manager.js:93) | 处理服务器消息 |
| `onclose` | [websocket-manager.js:73](browser-extension/websocket-manager.js:73) | 连接关闭 | [cleanup](browser-extension/websocket-manager.js:493) | 清理资源、重连 |
| `onerror` | [websocket-manager.js:85](browser-extension/websocket-manager.js:85) | 连接错误 | [scheduleReconnect](browser-extension/websocket-manager.js:503) | 安排重连 |

##### Popup 事件监听器

| 事件 | 位置 | 元素 | 功能 |
|------|------|------|------|
| `click` | [popup.js:87](browser-extension/popup.js:87) | 登录按钮 | 执行登录 |
| `click` | [popup.js:90](browser-extension/popup.js:90) | 打开面板按钮 | 打开 Web 管理界面 |
| `click` | [popup.js:93](browser-extension/popup.js:93) | 同步按钮 | 手动触发同步 |
| `click` | [popup.js:96](browser-extension/popup.js:96) | 导入按钮 | 从浏览器导入数据 |
| `click` | [popup.js:99](browser-extension/popup.js:99) | 导出按钮 | 导出到浏览器 |
| `click` | [popup.js:102](browser-extension/popup.js:102) | 设置按钮 | 打开设置页面 |
| `click` | [popup.js:105](browser-extension/popup.js:105) | 退出按钮 | 清除 token |
| `keypress` | [popup.js:112](browser-extension/popup.js:112) | 密码输入框 | Enter 键登录 |

#### 5.2.3 前端事件监听器

| 事件 | 位置 | 组件 | 功能 |
|------|------|------|------|
| 表单提交 | [Login.jsx](web-client/src/pages/Login.jsx) | 登录表单 | 处理用户登录 |
| 表单提交 | [Bookmarks.jsx](web-client/src/pages/Bookmarks.jsx) | 书签表单 | 创建/更新书签 |
| 表单提交 | [Passwords.jsx](web-client/src/pages/Passwords.jsx) | 密码表单 | 创建/更新密码 |
| 搜索输入 | [Bookmarks.jsx](web-client/src/pages/Bookmarks.jsx) | 搜索框 | 防抖搜索书签 |
| 导出点击 | [Bookmarks.jsx](web-client/src/pages/Bookmarks.jsx) | 导出按钮 | 下载书签文件 |
| 文件上传 | [ImportExport.jsx](web-client/src/pages/ImportExport.jsx) | 文件输入 | 导入数据 |
| 路由变化 | [App.jsx](web-client/src/App.jsx) | React Router | 路由守卫 |

---

## 6. 关键文件索引

### 6.1 后端关键文件

| 文件路径 | 行号 | 功能说明 |
|----------|------|----------|
| [backend/src/app.js](backend/src/app.js) | 27-43 | Express 应用配置、中间件设置 |
| [backend/src/routes/auth.js](backend/src/routes/auth.js) | 42-72 | POST /login - 用户登录逻辑 |
| [backend/src/routes/auth.js](backend/src/routes/auth.js) | 85-102 | POST /verify-password - 二次密码验证 |
| [backend/src/routes/bookmarks.js](backend/src/routes/bookmarks.js) | 18-29 | GET / - 获取并解密书签列表 |
| [backend/src/routes/bookmarks.js](backend/src/routes/bookmarks.js) | 44-72 | POST / - 创建书签（加密） |
| [backend/src/routes/passwords.js](backend/src/routes/passwords.js) | 42-58 | GET /:id - 获取密码详情（解密） |
| [backend/src/services/websocket.js](backend/src/services/websocket.js) | 86-118 | WebSocket 连接处理 |
| [backend/src/services/websocket.js](backend/src/services/websocket.js) | 139-175 | 书签变更通知 |
| [backend/src/services/websocket.js](backend/src/services/websocket.js) | 331-345 | 心跳检测定时器 |
| [backend/src/middleware/auth.js](backend/src/middleware/auth.js) | 9-29 | JWT 验证中间件 |
| [backend/src/middleware/validator.js](backend/src/middleware/validator.js) | 12-47 | Joi 参数验证中间件 |

### 6.2 前端关键文件

| 文件路径 | 行号 | 功能说明 |
|----------|------|----------|
| [web-client/src/main.jsx](web-client/src/main.jsx) | 全文 | 应用入口点 |
| [web-client/src/App.jsx](web-client/src/App.jsx) | 全文 | 路由配置、路由守卫 |
| [web-client/src/contexts/AuthContext.jsx](web-client/src/contexts/AuthContext.jsx) | 23-82 | 登录/注册/退出逻辑 |
| [web-client/src/services/api.js](web-client/src/services/api.js) | 8-20 | Axios 实例、拦截器配置 |
| [web-client/src/services/api.js](web-client/src/services/api.js) | 22-36 | 请求拦截器 - 添加 Token |
| [web-client/src/services/api.js](web-client/src/services/api.js) | 38-59 | 响应拦截器 - 错误处理 |
| [web-client/src/pages/Bookmarks.jsx](web-client/src/pages/Bookmarks.jsx) | 全文 | 书签 CRUD 操作 |
| [web-client/src/pages/Passwords.jsx](web-client/src/pages/Passwords.jsx) | 全文 | 密码 CRUD 操作 |
| [web-client/src/pages/ImportExport.jsx](web-client/src/pages/ImportExport.jsx) | 全文 | 导入导出功能 |

### 6.3 扩展关键文件

| 文件路径 | 行号 | 功能说明 |
|----------|------|----------|
| [browser-extension/manifest.json](browser-extension/manifest.json) | 全文 | 扩展配置、权限声明 |
| [browser-extension/background.js](browser-extension/background.js) | 18-23 | 浏览器启动事件处理 |
| [browser-extension/background.js](browser-extension/background.js) | 26-30 | 扩展安装事件处理 |
| [browser-extension/background.js](browser-extension/background.js) | 47-49 | 书签创建监听 |
| [browser-extension/background.js](browser-extension/background.js) | 624-678 | onBookmarkCreated - 自动同步书签到服务器 |
| [browser-extension/background.js](browser-extension/background.js) | 781-898 | onBookmarkRemoved - 从服务器删除书签 |
| [browser-extension/background.js](browser-extension/background.js) | 1252-1340 | saveBookmark - 保存书签到服务器 |
| [browser-extension/background.js](browser-extension/background.js) | 1342-1373 | savePassword - 保存密码到服务器 |
| [browser-extension/popup.js](browser-extension/popup.js) | 117-184 | 登录逻辑 |
| [browser-extension/popup.js](browser-extension/popup.js) | 326-389 | 同步功能 |
| [browser-extension/content.js](browser-extension/content.js) | 91-122 | detectPasswordForm - 检测登录表单 |
| [browser-extension/content.js](browser-extension/content.js) | 220-296 | showFormSaveHint - 显示保存按钮 |
| [browser-extension/content.js](browser-extension/content.js) | 298-334 | observeFormSubmissions - 监听表单提交 |
| [browser-extension/websocket-manager.js](browser-extension/websocket-manager.js) | 154-176 | handleBookmarkChange - 处理书签变更 |
| [browser-extension/websocket-manager.js](browser-extension/websocket-manager.js) | 178-270 | syncBookmarkToLocal - 同步书签到本地浏览器 |

### 6.4 数据库相关文件

| 文件路径 | 功能说明 |
|----------|----------|
| [backend/knexfile.js](backend/knexfile.js) | Knex.js 数据库配置 |
| [backend/migrations/001_create_users_table.js](backend/migrations/001_create_users_table.js) | 用户表迁移 |
| [backend/migrations/002_create_bookmarks_table.js](backend/migrations/002_create_bookmarks_table.js) | 书签表迁移 |
| [backend/migrations/003_create_passwords_table.js](backend/migrations/003_create_passwords_table.js) | 密码表迁移 |
| [backend/migrations/004_add_position_to_bookmarks.js](backend/migrations/004_add_position_to_bookmarks.js) | 添加书签位置字段 |

---

## 7. 快速定位问题指南

### 7.1 登录相关问题

#### 问题：登录失败，提示"认证失败"

**排查步骤：**

1. 检查后端是否运行
   ```bash
   curl http://localhost:3001/health
   ```

2. 检查数据库连接
   - 查看 [backend/src/config/database.js](backend/src/config/database.js:8)
   - 确认 `.env` 中的数据库配置

3. 检查 JWT_SECRET 是否配置
   - 文件：[backend/.env](backend/.env)
   - 确认 `JWT_SECRET` 已设置

4. 查看后端日志
   ```bash
   tail -f logs/backend.log
   ```

**关键代码位置：**
- 登录路由：[backend/src/routes/auth.js:42](backend/src/routes/auth.js:42)
- 密码比对：[backend/src/routes/auth.js:54](backend/src/routes/auth.js:54)
- JWT 生成：[backend/src/routes/auth.js:60](backend/src/routes/auth.js:60)

#### 问题：扩展登录后无法保存书签

**排查步骤：**

1. 检查 Token 是否存储
   - 打开扩展 DevTools
   - Console 执行：`chrome.storage.sync.get('token')`

2. 检查 Token 是否有效
   - 代码位置：[browser-extension/background.js:1408](browser-extension/background.js:1408)

3. 检查 API 请求是否携带 Token
   - 代码位置：[browser-extension/background.js:1268](browser-extension/background.js:1268)

### 7.2 书签同步问题

#### 问题：书签无法自动同步

**排查步骤：**

1. 检查是否在"同步收藏夹"内
   - 代码位置：[browser-extension/background.js:681](browser-extension/background.js:681)
   - 函数：`checkBookmarkInSyncFolder(bookmarkId)`

2. 检查书签事件监听器是否触发
   - 打开 `chrome://extensions`
   - 点击扩展的"Service Worker"查看日志
   - 添加书签时观察日志输出

3. 检查登录状态
   - 代码位置：[browser-extension/background.js:649](browser-extension/background.js:649)

**关键代码位置：**
- 书签创建监听：[background.js:47](browser-extension/background.js:47)
- 判断是否在同步文件夹：[background.js:681](browser-extension/background.js:681)
- 上传到服务器：[background.js:1252](browser-extension/background.js:1252)

#### 问题：WebSocket 实时同步不工作

**排查步骤：**

1. 检查后端 WebSocket 是否启动
   - 代码位置：[backend/src/app.js:65](backend/src/app.js:65)

2. 检查扩展 WebSocket 连接状态
   - 打开扩展 Popup
   - 查看状态显示

3. 检查 Token 是否通过 URL 传递
   - 代码位置：[browser-extension/websocket-manager.js:33](browser-extension/websocket-manager.js:33)

4. 查看心跳是否正常
   - 后端心跳：[websocket.js:331](backend/src/services/websocket.js:331)
   - 客户端心跳：[websocket-manager.js:485](browser-extension/websocket-manager.js:485)

**关键代码位置：**
- WebSocket 服务器：[backend/src/services/websocket.js:33](backend/src/services/websocket.js:33)
- WebSocket 客户端：[browser-extension/websocket-manager.js:16](browser-extension/websocket-manager.js:16)
- 连接管理：[browser-extension/background.js:87](browser-extension/background.js:87)

#### 问题：删除书签后服务器未删除

**排查步骤：**

1. 检查书签删除事件是否触发
   - 代码位置：[background.js:52](browser-extension/background.js:52)

2. 检查是否在同步文件夹内
   - 代码位置：[background.js:849](browser-extension/background.js:849)
   - 函数：`checkParentIsSyncFolder(parentId)`

3. 检查服务器删除 API
   - 代码位置：[background.js:760](browser-extension/background.js:760)
   - API：`DELETE /bookmarks/:id`

### 7.3 密码相关问题

#### 问题：密码自动检测不工作

**排查步骤：**

1. 检查自动检测是否开启
   - 打开扩展设置
   - 查看 `autoDetect` 选项

2. 检查表单检测逻辑
   - 代码位置：[content.js:91](browser-extension/content.js:91)
   - 函数：`detectPasswordForm()`

3. 检查表单评分算法
   - 代码位置：[content.js:124](browser-extension/content.js:124)
   - 函数：`scoreForm(form)`

4. 检查登录状态
   - 代码位置：[content.js:34](browser-extension/content.js:34)

**关键代码位置：**
- 表单检测：[content.js:205](browser-extension/content.js:205)
- 保存提示：[content.js:220](browser-extension/content.js:220)
- 表单提交监听：[content.js:298](browser-extension/content.js:298)

#### 问题：查看密码时验证失败

**排查步骤：**

1. 检查二次验证 API
   - 代码位置：[backend/src/routes/auth.js:85](backend/src/routes/auth.js:85)
   - API：`POST /api/auth/verify-password`

2. 检查密码比对逻辑
   - 代码位置：[auth.js:95](backend/src/routes/auth.js:95)

3. 检查前端验证弹窗
   - 代码位置：[web-client/src/pages/Passwords.jsx](web-client/src/pages/Passwords.jsx)

### 7.4 导入导出问题

#### 问题：导入书签失败

**排查步骤：**

1. 检查文件大小限制
   - 后端限制：10MB
   - 代码位置：[backend/src/routes/import-export.js:66](backend/src/routes/import-export.js:66)

2. 检查文件解析逻辑
   - JSON 解析：[import-export.js:83](backend/src/routes/import-export.js:83)
   - HTML 解析：[import-export.js:107](backend/src/routes/import-export.js:107)

3. 检查重复检测逻辑
   - 代码位置：[import-export.js:134](backend/src/routes/import-export.js:134)

#### 问题：导出书签格式不正确

**排查步骤：**

1. 检查 JSON 导出
   - 代码位置：[import-export.js:12](backend/src/routes/import-export.js:12)

2. 检查 HTML 导出（Netscape 格式）
   - 代码位置：[import-export.js:31](backend/src/routes/import-export.js:31)

### 7.5 性能问题

#### 问题：大量书签同步缓慢

**排查步骤：**

1. 检查批量插入逻辑
   - 当前为逐个插入，可考虑使用批量插入

2. 检查前端分页加载
   - 代码位置：[web-client/src/pages/Bookmarks.jsx](web-client/src/pages/Bookmarks.jsx)

3. 检查数据库索引
   - 迁移文件：[backend/migrations/002_create_bookmarks_table.js](backend/migrations/002_create_bookmarks_table.js:20)

### 7.6 数据加密问题

#### 问题：书签/密码无法解密

**排查步骤：**

1. 检查 ENCRYPTION_KEY 是否一致
   - 文件：[backend/.env](backend/.env)
   - 必须是 32 字符

2. 检查加密/解密方法
   - 加密：[bookmarks.js:44](backend/src/routes/bookmarks.js:44)
   - 解密：[bookmarks.js:18](backend/src/routes/bookmarks.js:18)

3. 检查 encrypted_data 字段格式
   - 应该是加密后的 JSON 字符串

**关键代码位置：**
- 加密工具：需查看后端代码中的 CryptoJS 使用
- 书签加密：[bookmarks.js:44](backend/src/routes/bookmarks.js:44)
- 密码加密：[passwords.js:39](backend/src/routes/passwords.js:39)

---

## 附录

### A. 环境变量配置

**后端 `.env` 文件：**

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bookmark_sync
DB_USER=postgres
DB_PASSWORD=123456

# JWT 配置
JWT_SECRET=your-jwt-secret-key-change-this
JWT_EXPIRES_IN=7d

# 服务器配置
PORT=3001
NODE_ENV=development

# 加密密钥（32字符）
ENCRYPTION_KEY=your-32-character-encryption-key

# 允许的前端域名
ALLOWED_ORIGINS=http://localhost:3002,http://localhost:19006
```

### B. 数据库表结构

**users 表：**
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**bookmarks 表：**
```sql
CREATE TABLE bookmarks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  encrypted_data TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**passwords 表：**
```sql
CREATE TABLE passwords (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  encrypted_data TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### C. 常用命令

```bash
# 启动所有服务
./start-all.sh

# 停止所有服务
./stop-all.sh

# 查看后端日志
tail -f logs/backend.log

# 查看前端日志
tail -f logs/frontend.log

# 运行数据库迁移
cd backend && npm run migrate

# 启动 PostgreSQL (Docker)
docker run -d \
  --name postgres-bookmark \
  -e POSTGRES_PASSWORD=123456 \
  -e POSTGRES_DB=bookmark_sync \
  -p 5432:5432 \
  postgres:15
```

---

## 文档更新记录

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2025-02-07 | 1.0 | 初始版本，包含完整的架构和流程文档 |

---

**文档维护者：** Claude Code
**最后更新：** 2025-02-07
**项目仓库：** `/home/administrator/workspace/browser-sync`
