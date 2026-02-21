# 密码 API

> 密码管理接口详细说明

---

## 获取密码列表

### 请求

```
GET /api/passwords
Authorization: Bearer <token>
```

### 成功响应

```json
{
  "passwords": [
    {
      "id": 1,
      "site_name": "GitHub",
      "site_url": "https://github.com",
      "username": "developer",
      "notes": "工作账号",
      "category": "开发工具",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 说明

- 返回当前用户的所有密码记录
- **不包含实际密码字段**，只返回元数据
- 按 created_at 降序排列

---

## 获取密码详情

获取包含实际密码的完整记录。

### 请求

```
GET /api/passwords/:id
Authorization: Bearer <token>
```

### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 密码记录 ID |

### 成功响应

```json
{
  "password": {
    "id": 1,
    "site_name": "GitHub",
    "site_url": "https://github.com",
    "username": "developer",
    "password": "my_secret_password",
    "notes": "工作账号",
    "category": "开发工具",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### 错误响应

| 状态码 | 错误信息 |
|--------|----------|
| 401 | 未授权 |
| 404 | 密码记录不存在 |

---

## 创建密码

### 请求

```
POST /api/passwords
Authorization: Bearer <token>
Content-Type: application/json
```

### 请求体

```json
{
  "site_name": "GitHub",
  "site_url": "https://github.com",
  "username": "developer",
  "password": "my_secret_password",
  "notes": "工作账号",
  "category": "开发工具"
}
```

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| site_name | string | 是 | 网站名称 |
| site_url | string | 是 | 网站 URL，需为有效 URL 格式 |
| username | string | 是 | 用户名 |
| password | string | 是 | 密码 |
| notes | string | 否 | 备注 |
| category | string | 否 | 分类 |

### 成功响应

```json
{
  "message": "密码创建成功",
  "password": {
    "id": 1,
    "site_name": "GitHub",
    "site_url": "https://github.com",
    "username": "developer",
    "notes": "工作账号",
    "category": "开发工具",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### 错误响应

| 状态码 | 错误信息 |
|--------|----------|
| 400 | 参数验证失败 |
| 401 | 未授权 |

---

## 更新密码

### 请求

```
PUT /api/passwords/:id
Authorization: Bearer <token>
Content-Type: application/json
```

### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 密码记录 ID |

### 请求体

```json
{
  "site_name": "GitHub Enterprise",
  "site_url": "https://github.enterprise.com",
  "username": "new_username",
  "password": "new_password",
  "notes": "企业账号",
  "category": "企业工具"
}
```

### 参数说明

所有字段均为可选，只更新提供的字段。

### 成功响应

```json
{
  "message": "密码更新成功",
  "password": {
    "id": 1,
    "site_name": "GitHub Enterprise",
    "site_url": "https://github.enterprise.com",
    "username": "new_username",
    "notes": "企业账号",
    "category": "企业工具",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-02T00:00:00.000Z"
  }
}
```

### 错误响应

| 状态码 | 错误信息 |
|--------|----------|
| 400 | 参数验证失败 |
| 401 | 未授权 |
| 404 | 密码记录不存在 |

---

## 删除密码

### 请求

```
DELETE /api/passwords/:id
Authorization: Bearer <token>
```

### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 密码记录 ID |

### 成功响应

```json
{
  "message": "密码删除成功"
}
```

### 错误响应

| 状态码 | 错误信息 |
|--------|----------|
| 401 | 未授权 |
| 404 | 密码记录不存在 |

---

## 安全特性

### 数据加密

- 所有密码数据使用 AES-256 加密存储
- 加密在服务端进行
- 密钥由 `ENCRYPTION_KEY` 环境变量管理

### 访问控制

- 列表接口不返回实际密码
- 详情接口需要单独请求
- 只能访问自己的密码记录

### WebSocket 同步

密码变更会通过 WebSocket 广播。

```json
{
  "type": "password_change",
  "data": {
    "action": "create",
    "password": {
      "id": 1,
      "site_name": "GitHub"
    }
  }
}
```
