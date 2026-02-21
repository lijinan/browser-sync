# API 参考文档

> Level 2-3 文档 - REST API 接口参考

---

## API 概览

| 属性 | 值 |
|------|-----|
| **基础 URL** | `/api` |
| **认证方式** | JWT Bearer Token |
| **数据格式** | JSON |
| **字符编码** | UTF-8 |

---

## 认证

### 请求头

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Token 获取

通过登录接口获取 JWT Token，有效期由 `JWT_EXPIRES_IN` 配置（默认 7 天）。

---

## 通用响应格式

### 成功响应

```json
{
  "message": "操作成功",
  "data": { ... }
}
```

### 错误响应

```json
{
  "error": "错误描述",
  "details": ["详细错误信息"]
}
```

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 (Token 无效或过期) |
| 403 | 禁止访问 |
| 404 | 资源不存在 |
| 409 | 资源冲突 |
| 500 | 服务器内部错误 |

---

## API 模块

| 模块 | 前缀 | 文档 |
|------|------|------|
| 认证 | `/api/auth` | [auth.md](auth.md) |
| 书签 | `/api/bookmarks` | [bookmarks.md](bookmarks.md) |
| 密码 | `/api/passwords` | [passwords.md](passwords.md) |
| 导入导出 | `/api/import-export` | [import-export.md](import-export.md) |

---

## 快速参考

### 认证接口

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/auth/register` | 否 | 用户注册 |
| POST | `/api/auth/login` | 否 | 用户登录 |
| GET | `/api/auth/me` | 是 | 获取当前用户 |
| POST | `/api/auth/verify-password` | 是 | 二次密码验证 |

### 书签接口

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/bookmarks` | 是 | 获取书签列表 |
| POST | `/api/bookmarks` | 是 | 创建书签 |
| PUT | `/api/bookmarks/:id` | 是 | 更新书签 |
| DELETE | `/api/bookmarks/:id` | 是 | 删除书签 |

### 密码接口

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/passwords` | 是 | 获取密码列表 |
| GET | `/api/passwords/:id` | 是 | 获取密码详情 |
| POST | `/api/passwords` | 是 | 创建密码 |
| PUT | `/api/passwords/:id` | 是 | 更新密码 |
| DELETE | `/api/passwords/:id` | 是 | 删除密码 |

### 导入导出接口

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/import-export/bookmarks/export` | 是 | 导出书签 JSON |
| GET | `/api/import-export/bookmarks/export/html` | 是 | 导出书签 HTML |
| POST | `/api/import-export/bookmarks/import` | 是 | 导入书签 |

---

## 请求限流

| 环境 | 限制 |
|------|------|
| 开发环境 | 10000 请求/分钟 |
| 生产环境 | 100 请求/分钟 |

超出限制返回 429 状态码。

---

## WebSocket

### 连接地址

```
ws://localhost:3001/ws?token=<jwt_token>
```

### 消息类型

| 类型 | 方向 | 说明 |
|------|------|------|
| ping | 服务端 -> 客户端 | 心跳请求 |
| pong | 客户端 -> 服务端 | 心跳响应 |
| connected | 服务端 -> 客户端 | 连接成功 |
| bookmark_change | 服务端 -> 客户端 | 书签变更通知 |
| password_change | 服务端 -> 客户端 | 密码变更通知 |
