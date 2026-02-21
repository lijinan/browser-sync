# 系统概览

> Level 1 文档 - 提供系统整体视图和架构概览

---

## 项目信息

| 属性 | 值 |
|------|-----|
| **名称** | 书签密码同步应用 (browser-sync) |
| **版本** | 1.0.0 |
| **类型** | 私有化部署的多端同步应用 |
| **核心特性** | 端到端加密、实时同步、跨平台支持 |

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户交互层                                │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  Browser        │  Web Client     │  Mobile (计划中)            │
│  Extension      │  (React SPA)    │                             │
│  Chrome/Firefox │  Port: 3002     │                             │
└────────┬────────┴────────┬────────┴─────────────────────────────┘
         │                 │
         │    REST API     │    WebSocket
         │    (HTTP)       │    (实时同步)
         │                 │
┌────────┴─────────────────┴─────────────────────────────────────┐
│                      后端服务层                                  │
│                   Backend API (Express)                         │
│                      Port: 3001                                 │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐ │
│  │ Auth Routes  │ Bookmark     │ Password     │ Import/      │ │
│  │              │ Routes       │ Routes       │ Export       │ │
│  └──────────────┴──────────────┴──────────────┴──────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              WebSocket Service (实时同步)                 │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Knex.js ORM
                             │
┌────────────────────────────┴────────────────────────────────────┐
│                       数据存储层                                 │
│                    PostgreSQL Database                          │
│                       Port: 5432                                │
│  ┌──────────────┬──────────────┬──────────────┐                │
│  │ users        │ bookmarks    │ passwords    │                │
│  │ (用户表)     │ (书签表)     │ (密码表)     │                │
│  └──────────────┴──────────────┴──────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 核心组件

### 1. 后端服务 (Backend)

| 属性 | 值 |
|------|-----|
| **路径** | `backend/` |
| **技术栈** | Node.js + Express + PostgreSQL |
| **端口** | 3001 |
| **入口文件** | [backend/src/app.js](../../backend/src/app.js) |
| **详细文档** | [docs/backend/](../backend/) |

**主要职责：**
- REST API 服务
- JWT 认证
- 数据加密存储
- WebSocket 实时同步

### 2. Web 客户端 (Web Client)

| 属性 | 值 |
|------|-----|
| **路径** | `web-client/` |
| **技术栈** | React 18 + Vite + Ant Design |
| **端口** | 3002 |
| **入口文件** | [web-client/src/main.jsx](../../web-client/src/main.jsx) |
| **详细文档** | [docs/frontend/](../frontend/) |

**主要职责：**
- 用户界面
- 书签管理
- 密码管理
- 数据导入导出

### 3. 浏览器扩展 (Browser Extension)

| 属性 | 值 |
|------|-----|
| **路径** | `browser-extension/` |
| **技术栈** | Manifest V3 / WebExtension |
| **支持浏览器** | Chrome, Edge, Firefox |
| **清单文件** | [browser-extension/manifest.json](../../browser-extension/manifest.json) |
| **详细文档** | [docs/extension/](../extension/) |

**主要职责：**
- 一键保存书签
- 表单自动填充
- 右键菜单操作
- 实时同步通知

---

## 数据流

### 用户操作流程

```
用户操作 ──► 客户端验证 ──► API请求 ──► JWT验证 ──► 业务处理 ──► 数据加密 ──► 数据库存储
                │                                              │
                └──────────── WebSocket 通知 ◄─────────────────┘
```

### 认证流程

```
1. 用户登录 ──► 后端验证 ──► 生成JWT ──► 返回Token
2. 后续请求 ──► 携带Token ──► 中间件验证 ──► 允许访问
```

### 同步流程

```
设备A修改 ──► API保存 ──► WebSocket广播 ──► 设备B接收 ──► 本地更新
```

---

## 安全机制

| 层级 | 机制 | 说明 |
|------|------|------|
| **传输层** | HTTPS | 加密通信（生产环境） |
| **认证层** | JWT | 无状态令牌认证 |
| **授权层** | Middleware | 路由权限控制 |
| **数据层** | AES-256 | 敏感数据加密存储 |
| **密码层** | bcrypt | 密码哈希（12轮） |
| **防护层** | Rate Limiting | API 请求限流 |
| **安全头** | Helmet | HTTP 安全头设置 |

---

## 技术栈总览

### 后端技术

| 类别 | 技术 |
|------|------|
| 运行时 | Node.js |
| 框架 | Express.js |
| 数据库 | PostgreSQL |
| ORM | Knex.js |
| 认证 | JWT (jsonwebtoken) |
| 加密 | crypto-js (AES) |
| 密码哈希 | bcryptjs |
| 验证 | Joi |
| 实时通信 | ws (WebSocket) |
| 安全 | helmet, cors, express-rate-limit |

### 前端技术

| 类别 | 技术 |
|------|------|
| 框架 | React 18 |
| 构建 | Vite |
| UI库 | Ant Design |
| 路由 | React Router DOM |
| HTTP | Axios |
| 加密 | crypto-js |
| Cookie | js-cookie |

---

## 快速导航

| 文档 | 路径 | 说明 |
|------|------|------|
| **后端文档** | [docs/backend/](../backend/) | API 服务详细说明 |
| **前端文档** | [docs/frontend/](../frontend/) | Web 客户端详细说明 |
| **扩展文档** | [docs/extension/](../extension/) | 浏览器扩展详细说明 |
| **数据库文档** | [docs/database/](../database/) | 数据模型和迁移 |
| **API文档** | [docs/api/](../api/) | API 接口参考 |

---

## 开发命令

```bash
# 后端开发
cd backend && npm run dev

# 前端开发
cd web-client && npm run dev

# 数据库迁移
cd backend && npm run migrate

# 运行测试
cd backend && npm test
```

---

## 服务地址

| 服务 | 开发环境 | 说明 |
|------|----------|------|
| Web 客户端 | http://localhost:3002 | 用户界面 |
| 后端 API | http://localhost:3001 | REST API |
| WebSocket | ws://localhost:3001/ws | 实时同步 |
| 数据库 | localhost:5432 | PostgreSQL |
