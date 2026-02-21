# 后端服务概览

> Level 2 文档 - 后端模块整体说明

---

## 模块信息

| 属性 | 值 |
|------|-----|
| **路径** | `backend/` |
| **技术栈** | Node.js + Express + PostgreSQL |
| **端口** | 3001 |
| **入口文件** | [src/app.js](../../backend/src/app.js) |

---

## 目录结构

```
backend/
├── src/
│   ├── app.js                 # 应用入口
│   ├── routes/                # API 路由
│   │   ├── auth.js            # 认证路由
│   │   ├── bookmarks.js       # 书签路由
│   │   ├── passwords.js       # 密码路由
│   │   └── import-export.js   # 导入导出路由
│   ├── middleware/            # 中间件
│   │   ├── auth.js            # JWT 认证
│   │   └── errorHandler.js    # 错误处理
│   ├── services/              # 服务层
│   │   └── websocket.js       # WebSocket 服务
│   └── config/                # 配置
│       └── database.js        # 数据库连接
├── migrations/                # 数据库迁移
│   ├── 001_create_users_table.js
│   ├── 002_create_bookmarks_table.js
│   ├── 003_create_passwords_table.js
│   └── 004_add_position_to_bookmarks.js
├── knexfile.js                # Knex 配置
├── package.json               # 依赖配置
└── .env                       # 环境变量
```

---

## 核心模块

### 路由模块

| 路由 | 文件 | 前缀 | 说明 |
|------|------|------|------|
| 认证 | [routes/auth.js](../../backend/src/routes/auth.js) | `/api/auth` | 登录、注册、验证 |
| 书签 | [routes/bookmarks.js](../../backend/src/routes/bookmarks.js) | `/api/bookmarks` | 书签 CRUD |
| 密码 | [routes/passwords.js](../../backend/src/routes/passwords.js) | `/api/passwords` | 密码 CRUD |
| 导入导出 | [routes/import-export.js](../../backend/src/routes/import-export.js) | `/api/import-export` | 数据导入导出 |

### 中间件

| 中间件 | 文件 | 说明 |
|--------|------|------|
| 认证 | [middleware/auth.js](../../backend/src/middleware/auth.js) | JWT Token 验证 |
| 错误处理 | [middleware/errorHandler.js](../../backend/src/middleware/errorHandler.js) | 统一错误处理 |

### 服务

| 服务 | 文件 | 说明 |
|------|------|------|
| WebSocket | [services/websocket.js](../../backend/src/services/websocket.js) | 实时同步服务 |

---

## 应用初始化流程

```javascript
// src/app.js 初始化顺序
1. 加载环境变量 (dotenv)
2. 创建 Express 应用
3. 配置安全中间件 (helmet, cors)
4. 配置请求限流 (rate-limit)
5. 解析请求体 (JSON, URL-encoded)
6. 注册路由
7. 配置错误处理
8. 初始化 WebSocket 服务
9. 启动 HTTP 服务器
```

---

## 请求处理流程

```
HTTP 请求
    │
    ▼
┌─────────────┐
│   Helmet    │ ─── HTTP 安全头
└─────────────┘
    │
    ▼
┌─────────────┐
│    CORS    │ ─── 跨域处理
└─────────────┘
    │
    ▼
┌─────────────┐
│ Rate Limit  │ ─── 请求限流
└─────────────┘
    │
    ▼
┌─────────────┐
│ Body Parser │ ─── 解析请求体
└─────────────┘
    │
    ▼
┌─────────────┐
│   Router    │ ─── 路由匹配
└─────────────┘
    │
    ▼
┌─────────────┐
│   Auth      │ ─── JWT 验证 (需要认证的路由)
│ Middleware  │
└─────────────┘
    │
    ▼
┌─────────────┐
│   Handler   │ ─── 业务处理
└─────────────┘
    │
    ▼
┌─────────────┐
│   Error     │ ─── 错误处理
│  Handler    │
└─────────────┘
    │
    ▼
HTTP 响应
```

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | 3001 |
| `NODE_ENV` | 运行环境 | development |
| `DB_HOST` | 数据库主机 | localhost |
| `DB_PORT` | 数据库端口 | 5432 |
| `DB_NAME` | 数据库名称 | bookmark_sync |
| `DB_USER` | 数据库用户 | postgres |
| `DB_PASSWORD` | 数据库密码 | password |
| `JWT_SECRET` | JWT 密钥 | - |
| `JWT_EXPIRES_IN` | JWT 过期时间 | 7d |
| `ENCRYPTION_KEY` | 数据加密密钥 | - |
| `ALLOWED_ORIGINS` | 允许的跨域来源 | - |

---

## 依赖包

### 生产依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| express | ^4.18.2 | Web 框架 |
| pg | ^8.11.3 | PostgreSQL 客户端 |
| knex | ^2.5.1 | SQL 查询构建器 |
| jsonwebtoken | ^9.0.2 | JWT 认证 |
| bcryptjs | ^2.4.3 | 密码哈希 |
| crypto-js | ^4.1.1 | 数据加密 |
| joi | ^17.9.2 | 参数验证 |
| ws | ^8.14.2 | WebSocket 服务 |
| helmet | ^7.0.0 | 安全中间件 |
| cors | ^2.8.5 | 跨域处理 |
| express-rate-limit | ^6.10.0 | 请求限流 |
| multer | ^2.0.2 | 文件上传 |

### 开发依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| nodemon | ^3.0.1 | 开发热重载 |
| jest | ^29.6.2 | 测试框架 |
| supertest | ^6.3.3 | API 测试 |

---

## 开发命令

```bash
# 安装依赖
npm install

# 开发模式 (热重载)
npm run dev

# 生产模式
npm start

# 运行测试
npm test

# 数据库迁移
npm run migrate

# 数据库种子
npm run seed
```

---

## 详细文档

| 文档 | 路径 | 说明 |
|------|------|------|
| 路由模块 | [routes.md](routes.md) | 各路由详细说明 |
| 中间件 | [middleware.md](middleware.md) | 中间件实现 |
| WebSocket | [websocket.md](websocket.md) | 实时同步服务 |
